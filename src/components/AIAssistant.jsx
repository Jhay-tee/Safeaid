import { useState, useEffect, useRef, useCallback } from "react";
import { Loader2, Heart, Shield, Activity, AlertTriangle } from "lucide-react";
import { cn } from "../lib/utils";
import { extractText } from "../utils/ChatHelpers";

import ChatHeader from "./ChatHeader";
import MessageItem from "./MessageItem";
import ChatInput from "./ChatInput";
import ErrorMessage from "./ErrorMessage";
import ContextMenu from "./ContextMenu";

const TYPE_CONFIG = {
  health: { name: "Health Assistant", icon: Heart, color: "text-pink-500", placeholder: "Ask a health question..." },
  "first-aid": { name: "First Aid Guide", icon: Activity, color: "text-green-500", placeholder: "What's the injury?" },
  emergency: { name: "Emergency AI", icon: Shield, color: "text-red-500", placeholder: "Describe the emergency..." },
};

export default function AIAssistant({ type, incrementUsage, isLimitReached }) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState(() => {
    try {
      const saved = localStorage.getItem(`safeaid_chat_${type}`);
      if (!saved) return [];
      
      const parsed = JSON.parse(saved);
      
      // Deduplicate IDs (fixes old duplicate keys from localStorage)
      const seenIds = new Set();
      return parsed.map((msg) => {
        if (seenIds.has(msg.id)) {
          return { ...msg, id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}` };
        }
        seenIds.add(msg.id);
        return msg;
      });
    } catch (_) {
      return [];
    }
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastRequestTime, setLastRequestTime] = useState(0);
  const [contextMenu, setContextMenu] = useState(null);
  const messagesEndRef = useRef(null);
  const config = TYPE_CONFIG[type];

  const generateId = () => `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  useEffect(() => {
    try {
      localStorage.setItem(`safeaid_chat_${type}`, JSON.stringify(messages));
    } catch (_) {}
  }, [messages, type]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, scrollToBottom]);

  const handleSend = async (retryInput) => {
    const textToUse = retryInput || input;
    if (!textToUse.trim() || isLoading) return;

    const now = Date.now();
    if (now - lastRequestTime < 2000) {
      setError("Please wait a moment before sending another message.");
      return;
    }
    setLastRequestTime(now);

    if (isLimitReached) {
      setError("You've reached your free usage limit. Please sign in to continue.");
      return;
    }

    // ✅ Build minimal context: last assistant message (if any) + new user message
    const lastAssistantMsg = [...messages]
      .reverse()
      .find(m => m.role === "assistant" && !m.deleted && m.content);
    
    const contextMessages = [];
    if (lastAssistantMsg) {
      contextMessages.push({ role: "model", parts: [{ text: lastAssistantMsg.content }] });
    }
    contextMessages.push({ role: "user", parts: [{ text: textToUse }] });

    if (!retryInput) {
      setMessages((prev) => [
        ...prev,
        {
          id: generateId(),
          role: "user",
          content: textToUse,
          timestamp: new Date().toISOString(),
        },
      ]);
      setInput("");
    }

    setIsLoading(true);
    setError(null);

    const aiMessageId = generateId();

    setMessages((prev) => [
      ...prev,
      {
        id: aiMessageId,
        role: "assistant",
        content: "",
        timestamp: new Date().toISOString(),
      },
    ]);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          message: textToUse, 
          type,
          context: contextMessages   // ✅ Send the minimal context
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        let errMsg = `Server error (${res.status})`;
        try {
          const errData = await res.json();
          errMsg = typeof errData.error === "string" ? errData.error : errMsg;
        } catch (_) {}
        setMessages((prev) => prev.filter((m) => m.id !== aiMessageId));
        setError("Message didn't go through. Please click retry.");
        console.error("[SafeAid] API error:", { status: res.status, errMsg });
        setIsLoading(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let receivedContent = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const trimmed = part.trim();
          if (!trimmed.startsWith("data:")) continue;

          const jsonStr = trimmed.replace(/^data:\s*/, "").trim();
          if (!jsonStr || jsonStr === "[DONE]") continue;

          let parsed;
          try {
            parsed = JSON.parse(jsonStr);
          } catch (_) {
            continue;
          }

          if (parsed && typeof parsed.error === "string") {
            setMessages((prev) => prev.filter((m) => m.id !== aiMessageId));
            setError("Message didn't go through. Please click retry.");
            console.error("[SafeAid] Stream error:", parsed.error);
            setIsLoading(false);
            return;
          }

          const text = extractText(parsed);
          if (!text) continue;

          const triggerMatch = text.match(/\[TRIGGER_EMERGENCY:(\w+)\]/i);
          let cleanText = text;
          if (triggerMatch) {
            cleanText = text.replace(triggerMatch[0], "").trim();
            window.dispatchEvent(
              new CustomEvent("trigger-emergency", { detail: { service: triggerMatch[1].toLowerCase() } })
            );
          }

          if (!cleanText) continue;

          receivedContent = true;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aiMessageId ? { ...m, content: m.content + cleanText } : m
            )
          );
        }
      }

      if (!receivedContent) {
        setMessages((prev) => prev.filter((m) => m.id !== aiMessageId));
        setError("No response received from SafeAid. Please try again.");
        setIsLoading(false);
        return;
      }

      incrementUsage();
    } catch (err) {
      clearTimeout(timeoutId);
      setMessages((prev) => prev.filter((m) => m.id !== aiMessageId));
      setError("Message didn't go through. Please click retry.");
      console.error("[SafeAid] Request failed:", err);
      if (err.name === "AbortError") {
        console.error("[SafeAid] Request timed out after 30s.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleLongPress = (e, message) => {
    if (e.cancelable) e.preventDefault();
    const target = e.currentTarget;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    setContextMenu({
      visible: true,
      x: e.clientX || rect.left + rect.width / 2,
      y: e.clientY || rect.top,
      messageId: message.id,
      content: message.content,
    });
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setContextMenu(null);
  };

  const deleteMessage = (id) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, deleted: true } : m)));
    setContextMenu(null);
  };

  const clearHistory = () => {
    if (window.confirm("Clear all messages in this chat?")) {
      setMessages([]);
    }
  };

  const handleRetry = () => {
    setError(null);
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    if (lastUserMsg) handleSend(lastUserMsg.content);
  };

  return (
    <div className="flex flex-col h-full max-h-[80vh]">
      <ChatHeader config={config} messageCount={messages.length} onClear={clearHistory} />

      {isLimitReached && (
        <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center gap-3 text-amber-400 text-sm">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>You've reached the free usage limit. Please sign in to continue chatting.</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-4 lg:space-y-6 mb-6 pr-2 lg:pr-6 custom-scrollbar">
        {messages.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center py-12 lg:py-16 text-center opacity-20">
            <config.icon className="w-12 h-12 lg:w-16 lg:h-16 mb-4" />
            <p className="text-sm lg:text-base font-medium">No messages yet. Start the conversation.</p>
          </div>
        )}

        {messages.map((msg) => (
          <MessageItem
            key={msg.id}
            message={msg}
            onContextMenu={handleLongPress}
          />
        ))}

        {isLoading && (
          <div className="flex items-center gap-2 text-white/40 text-[10px] lg:text-sm font-bold uppercase tracking-widest ml-2">
            <Loader2 className="w-3 h-3 lg:w-4 lg:h-4 animate-spin" />
            SafeAid is thinking...
          </div>
        )}

        {error && <ErrorMessage error={error} onRetry={handleRetry} />}

        <div ref={messagesEndRef} />
      </div>

      <ChatInput
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onSend={handleSend}
        isLoading={isLoading}
        placeholder={isLimitReached ? "Sign in to continue chatting..." : config.placeholder}
        disabled={isLimitReached}
      />
    </div>
  );
}