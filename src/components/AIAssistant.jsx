import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Send, Loader2, Heart, Shield, Activity, Copy, Trash2 } from "lucide-react";
import { cn } from "../lib/utils";
import Markdown from "react-markdown";

const TYPE_CONFIG = {
  health: { name: "Health Assistant", icon: Heart, color: "text-pink-500", placeholder: "Ask a health question..." },
  "first-aid": { name: "First Aid Guide", icon: Activity, color: "text-green-500", placeholder: "What's the injury?" },
  emergency: { name: "Emergency AI", icon: Shield, color: "text-red-500", placeholder: "Describe the emergency..." },
};

function extractText(parsed) {
  if (!parsed || typeof parsed !== "object") return "";

  if (typeof parsed.text === "string" && parsed.text.trim()) return parsed.text;

  if (Array.isArray(parsed.candidates) && parsed.candidates.length > 0) {
    const parts = parsed.candidates[0]?.content?.parts;
    if (Array.isArray(parts)) {
      const joined = parts
        .filter((p) => !p.thought)
        .map((p) => (typeof p.text === "string" ? p.text : ""))
        .join("");
      if (joined.trim()) return joined;
    }
  }

  return "";
}

export default function AIAssistant({ type, incrementUsage, isLimitReached }) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState(() => {
    try {
      const saved = localStorage.getItem(`safeaid_chat_${type}`);
      return saved ? JSON.parse(saved) : [];
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
      setError("You've reached your limit. Please sign in to continue.");
      return;
    }

    if (!retryInput) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "user",
          content: textToUse,
          timestamp: new Date().toISOString(),
        },
      ]);
      setInput("");
    }

    setIsLoading(true);
    setError(null);

    const aiMessageId = (Date.now() + 1).toString();

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
        body: JSON.stringify({ message: textToUse, type }),
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
        setError(errMsg);
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
            setError(parsed.error);
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
      if (err.name === "AbortError") {
        setError("Request timed out. Please try again.");
      } else {
        setError(err.message || "Connection failed. Please check your internet and try again.");
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

  return (
    <div className="flex flex-col h-full max-h-[80vh]">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className={cn("p-3 rounded-xl bg-white/5", config.color)}>
            <config.icon className="w-6 h-6 lg:w-8 lg:h-8" />
          </div>
          <h2 className="text-xl lg:text-2xl font-bold tracking-tight">{config.name}</h2>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearHistory}
            className="text-[10px] font-bold text-white/20 hover:text-white/40 uppercase tracking-widest transition-colors"
          >
            Clear Chat
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 lg:space-y-6 mb-6 pr-2 lg:pr-6 custom-scrollbar">
        {messages.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center py-12 lg:py-16 text-center opacity-20">
            <config.icon className="w-12 h-12 lg:w-16 lg:h-16 mb-4" />
            <p className="text-sm lg:text-base font-medium">No messages yet. Start the conversation.</p>
          </div>
        )}

        {messages.map((msg) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            onContextMenu={(e) => handleLongPress(e, msg)}
            onTouchStart={(e) => {
              const timer = setTimeout(() => handleLongPress(e, msg), 500);
              e.currentTarget.dataset.timer = timer;
            }}
            onTouchEnd={(e) => clearTimeout(e.currentTarget.dataset.timer)}
            className={cn(
              "flex flex-col max-w-[85%] lg:max-w-[70%] group relative",
              msg.role === "user" ? "ml-auto items-end" : "mr-auto items-start"
            )}
          >
            <div
              className={cn(
                "p-4 rounded-2xl text-sm md:text-base lg:text-lg lg:p-6 transition-all",
                msg.role === "user"
                  ? "bg-white text-black font-medium rounded-tr-none"
                  : "bg-white/5 border border-white/10 text-white rounded-tl-none",
                msg.deleted && "opacity-40 italic bg-transparent border-dashed"
              )}
            >
              {msg.deleted ? (
                "Message was deleted"
              ) : msg.role === "assistant" ? (
                msg.content ? (
                  <div className="prose prose-invert prose-sm lg:prose lg:prose-lg max-w-none">
                    <Markdown>{msg.content}</Markdown>
                  </div>
                ) : (
                  <span className="opacity-40 text-xs uppercase tracking-widest animate-pulse">
                    Waiting for response...
                  </span>
                )
              ) : (
                <div className="prose prose-sm max-w-none">
                  <Markdown>{msg.content}</Markdown>
                </div>
              )}
            </div>
            <span className="text-[10px] lg:text-xs text-white/20 mt-1 uppercase tracking-tighter">
              {msg.role === "user" ? "You" : "SafeAid"}
            </span>
          </motion.div>
        ))}

        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 text-white/40 text-[10px] lg:text-sm font-bold uppercase tracking-widest ml-2"
          >
            <Loader2 className="w-3 h-3 lg:w-4 lg:h-4 animate-spin" />
            SafeAid is thinking...
          </motion.div>
        )}

        {error && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 lg:p-6 bg-red-500/10 border border-red-500/20 rounded-2xl text-xs lg:text-sm text-red-400 font-medium flex items-center justify-between gap-4"
          >
            <span>{error}</span>
            <button
              onClick={() => {
                setError(null);
                const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
                if (lastUserMsg) handleSend(lastUserMsg.content);
              }}
              className="px-3 py-1 bg-red-500/20 rounded-lg hover:bg-red-500/30 transition-colors shrink-0 font-bold uppercase tracking-tighter"
            >
              Retry
            </button>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="relative">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={config.placeholder}
          className="w-full bg-white/5 border border-white/10 backdrop-blur-md rounded-2xl p-4 pr-16 lg:p-5 min-h-[60px] lg:min-h-[80px] max-h-[120px] lg:max-h-[220px] focus:outline-none focus:border-white/20 transition-colors resize-none text-sm lg:text-base disabled:opacity-50"
          disabled={isLoading}
        />
        <button
          onClick={() => handleSend()}
          disabled={isLoading || !input.trim()}
          className="absolute bottom-3 right-3 p-2 bg-white text-black rounded-xl shadow-lg hover:bg-white/90 transition-all active:scale-[0.95] disabled:opacity-50"
        >
          {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
        </button>
      </div>

      <AnimatePresence>
        {contextMenu && (
          <>
            <div className="fixed inset-0 z-[100]" onClick={() => setContextMenu(null)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 10 }}
              style={{
                position: "fixed",
                left: Math.min(window.innerWidth - 150, contextMenu.x),
                top: Math.min(window.innerHeight - 100, contextMenu.y),
                zIndex: 101,
              }}
              className="bg-zinc-900 border border-white/10 rounded-xl p-1 shadow-2xl min-w-[140px]"
            >
              <button
                onClick={() => copyToClipboard(contextMenu.content)}
                className="w-full flex items-center gap-3 px-3 py-2 text-xs font-bold text-white hover:bg-white/10 rounded-lg transition-colors"
              >
                <Copy className="w-4 h-4" />
                COPY
              </button>
              <button
                onClick={() => deleteMessage(contextMenu.messageId)}
                className="w-full flex items-center gap-3 px-3 py-2 text-xs font-bold text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                DELETE
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
