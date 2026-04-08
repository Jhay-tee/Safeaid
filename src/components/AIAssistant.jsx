import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Send, Loader2, RefreshCw, Heart, Shield, Activity, Copy, Trash2, MoreVertical } from "lucide-react";
import { cn } from "../lib/utils";
import Markdown from "react-markdown";

const TYPE_CONFIG = {
  health: { name: "Health Assistant", icon: Heart, color: "text-pink-500", placeholder: "Ask a health question..." },
  "first-aid": { name: "First Aid Guide", icon: Activity, color: "text-green-500", placeholder: "What's the injury?" },
  emergency: { name: "Emergency AI", icon: Shield, color: "text-red-500", placeholder: "Describe the emergency..." },
};

// Fast typing effect component
function TypingText({ text, speed = 10, onComplete }) {
  const [displayedText, setDisplayedText] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (currentIndex < text.length) {
      const timeout = setTimeout(() => {
        setDisplayedText((prev) => prev + text[currentIndex]);
        setCurrentIndex((prev) => prev + 1);
      }, speed);
      return () => clearTimeout(timeout);
    } else if (onComplete) {
      onComplete();
    }
  }, [currentIndex, text, speed, onComplete]);

  return <Markdown>{displayedText}</Markdown>;
}

export default function AIAssistant({ type, incrementUsage, isLimitReached }) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState(() => {
    const saved = localStorage.getItem(`safeaid_chat_${type}`);
    return saved ? JSON.parse(saved) : [];
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastRequestTime, setLastRequestTime] = useState(0);
  const [contextMenu, setContextMenu] = useState(null);
  const messagesEndRef = useRef(null);
  const config = TYPE_CONFIG[type];

  // Persistence
  useEffect(() => {
    localStorage.setItem(`safeaid_chat_${type}`, JSON.stringify(messages));
  }, [messages, type]);

  // Scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, scrollToBottom]);
const handleSend = async (retryInput) => {
  const textToUse = retryInput || input;
  if (!textToUse.trim() || isLoading) return;

  // Cooldown check (2 seconds)
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
    const userMessage = {
      id: Date.now().toString(),
      role: "user",
      content: textToUse,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
  }

  setIsLoading(true);
  setError(null);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: textToUse, type }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Create one assistant message placeholder
    const aiMessageId = (Date.now() + 1).toString();
    setMessages((prev) => [
      ...prev,
      {
        id: aiMessageId,
        role: "assistant",
        content: "",
        timestamp: new Date().toISOString(),
        isNew: true,
      },
    ]);

    // Streaming reader
    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop(); // keep incomplete chunk

      for (const part of parts) {
        if (!part.startsWith("data:")) continue;

        try {
          const jsonStr = part.replace(/^data:\s*/, "");
          const parsed = JSON.parse(jsonStr);

          // Safely capture text from multiple possible fields
          let text =
            parsed.text ||
            (parsed.candidates &&
              parsed.candidates[0]?.content?.parts?.[0]?.text) ||
            "";

          if (!text || !text.trim()) continue;

          // Emergency trigger check
          const triggerMatch = text.match(/\[TRIGGER_EMERGENCY:(\w+)\]/i);
          let cleanText = text;
          if (triggerMatch) {
            const service = triggerMatch[1].toLowerCase();
            cleanText = text.replace(triggerMatch[0], "").trim();
            window.dispatchEvent(
              new CustomEvent("trigger-emergency", { detail: { service } })
            );
          }

          // Update the single assistant message progressively
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aiMessageId
                ? { ...m, content: m.content + cleanText }
                : m
            )
          );
        } catch (err) {
          console.warn("Skipping invalid JSON chunk:", part);
        }
      }
    }

    incrementUsage();
  } catch (err) {
    console.error("Chat Error:", err);
    setError(err.name === "AbortError" ? "Request timed out." : err.message);
  } finally {
    setIsLoading(false);
  }
};

const handleLongPress = (e, message) => {
  if (e.cancelable) {
    e.preventDefault();
  }

  const target = e.currentTarget;
  if (!target) return; // avoid null errors

  const rect = target.getBoundingClientRect();
  setContextMenu({
    visible: true,
    x: e.clientX || (rect.left + rect.width / 2),
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
    setMessages(prev => prev.map(m => m.id === id ? { ...m, deleted: true } : m));
    setContextMenu(null);
  };

  const clearHistory = () => {
    if (window.confirm("Clear all messages in this chat?")) {
      setMessages([]);
    }
  };

  return (
    <div className="flex flex-col h-full max-h-[80vh]">
      {/* Header */}
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

      {/* Messages Area */}
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
              ) : (
                msg.role === "assistant" && msg.isNew ? (
                  <TypingText 
                    text={msg.content} 
                    onComplete={() => {
                      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, isNew: false } : m));
                    }} 
                  />
                ) : (
                  <div className="prose prose-invert prose-sm lg:prose lg:prose-lg max-w-none">
                    <Markdown>{msg.content}</Markdown>
                  </div>
                )
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
          <div className="p-4 lg:p-6 bg-red-500/10 border border-red-500/20 rounded-2xl text-xs lg:text-sm text-red-400 font-medium flex items-center justify-between gap-4">
            <span>{error}</span>
            <button 
              onClick={() => {
                const lastUserMsg = [...messages].reverse().find(m => m.role === "user");
                if (lastUserMsg) handleSend(lastUserMsg.content);
                else handleSend();
              }} 
              className="px-3 py-1 bg-red-500/20 rounded-lg hover:bg-red-500/30 transition-colors shrink-0 font-bold uppercase tracking-tighter"
            >
              Retry
            </button>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
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

      {/* Context Menu Overlay */}
      <AnimatePresence>
        {contextMenu && (
          <>
            <div 
              className="fixed inset-0 z-[100]" 
              onClick={() => setContextMenu(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 10 }}
              style={{ 
                position: "fixed", 
                left: Math.min(window.innerWidth - 150, contextMenu.x), 
                top: Math.min(window.innerHeight - 100, contextMenu.y),
                zIndex: 101
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
