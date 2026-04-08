import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  Phone,
  ArrowLeft,
  Ambulance,
  Shield,
  Flame,
  UserPlus,
  Send,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { cn } from "../lib/utils";
import Markdown from "react-markdown";

const SERVICES = [
  {
    id: "ambulance",
    name: "Ambulance",
    numbers: ["+2348000022322", "+2348000022422", "+2348037343628", "+2348033597921"],
    icon: Ambulance,
    color: "text-red-500",
  },
  {
    id: "police",
    name: "Police",
    numbers: ["+2348039213071", "+2348028916010", "+2348020913810", "+2349040000065", "+2349169839215"],
    icon: Shield,
    color: "text-blue-500",
  },
  {
    id: "fire",
    name: "Fire Service",
    numbers: ["+2348133564978"],
    icon: Flame,
    color: "text-orange-500",
  },
  {
    id: "contact",
    name: "Emergency Contact",
    numbers: ["112"],
    icon: UserPlus,
    color: "text-green-500",
  },
];

export default function EmergencyView({ incrementUsage, isLimitReached }) {
  const navigate = useNavigate();
  const [selectedService, setSelectedService] = useState(null);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastRequestTime, setLastRequestTime] = useState(0);
  const [contextMenu, setContextMenu] = useState(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  useEffect(() => {
    const handleTrigger = (e) => {
      const service = SERVICES.find((s) => s.id === e.detail.service);
      if (service) setSelectedService(service);
    };
    window.addEventListener("trigger-emergency", handleTrigger);
    return () => window.removeEventListener("trigger-emergency", handleTrigger);
  }, []);

  const handleBack = () => {
    if (selectedService) setSelectedService(null);
    else navigate(-1);
  };

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
          id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          role: "user",
          content: textToUse,
          timestamp: new Date().toISOString(),
        },
      ]);
      setInput("");
    }

    setIsLoading(true);
    setError(null);

    const aiMessageId = `ai-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

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
        body: JSON.stringify({ message: textToUse, type: "emergency" }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        let errMsg = `Server error (${res.status})`;
        try {
          const errData = await res.json();
          errMsg = errData.error || errMsg;
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
        buffer = parts.pop();

        for (const part of parts) {
          if (!part.startsWith("data:")) continue;

          const jsonStr = part.replace(/^data:\s*/, "").trim();
          if (jsonStr === "[DONE]") continue;

          let parsed;
          try {
            parsed = JSON.parse(jsonStr);
          } catch (_) {
            continue;
          }

          if (parsed.error) {
            setMessages((prev) => prev.filter((m) => m.id !== aiMessageId));
            setError(parsed.error);
            setIsLoading(false);
            return;
          }

          const text =
            parsed.text ||
            parsed.candidates?.[0]?.content?.parts?.[0]?.text ||
            "";

          if (!text || !text.trim()) continue;

          const triggerMatch = text.match(/\[TRIGGER_EMERGENCY:(\w+)\]/i);
          let cleanText = text;
          if (triggerMatch) {
            cleanText = text.replace(triggerMatch[0], "").trim();
            window.dispatchEvent(
              new CustomEvent("trigger-emergency", { detail: { service: triggerMatch[1].toLowerCase() } })
            );
          }

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
        setError("No response received. Please try again.");
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
    const rect = e.currentTarget.getBoundingClientRect();
    setContextMenu({
      visible: true,
      x: e.clientX || rect.left,
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

  return (
    <motion.div className="space-y-8">
      <button onClick={handleBack} className="flex items-center gap-2 text-white/40 hover:text-white transition-colors">
        <ArrowLeft className="w-4 h-4" />
        {selectedService ? "Back to Services" : "Back"}
      </button>

      {selectedService ? (
        <>
          <div className="text-center space-y-6">
            <div className={cn("inline-flex p-6 rounded-full bg-white/5", selectedService.color)}>
              {(() => {
                const Icon = selectedService.icon;
                return <Icon className="w-16 h-16" />;
              })()}
            </div>
            <h2 className="text-3xl font-bold">{selectedService.name}</h2>

            <div className="flex flex-col gap-6">
              {selectedService.numbers.map((num, idx) => (
                <a
                  key={num + idx}
                  href={`tel:${num}`}
                  className="flex flex-col items-center justify-center py-12 bg-white text-black font-bold rounded-3xl transition-all active:scale-[0.98]"
                >
                  <Phone className="w-10 h-10" />
                  <span className="text-2xl font-black">CALL LINE {idx + 1}</span>
                  <span className="text-sm opacity-60">{num}</span>
                </a>
              ))}
            </div>
          </div>

          <div className="space-y-4 pt-6">
            <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1 custom-scrollbar">
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "flex flex-col max-w-[85%]",
                    msg.role === "user" ? "ml-auto items-end" : "mr-auto items-start"
                  )}
                  onContextMenu={(e) => handleLongPress(e, msg)}
                >
                  <div
                    className={cn(
                      "p-4 rounded-2xl text-sm break-words",
                      msg.role === "user"
                        ? "bg-white text-black font-medium rounded-tr-none"
                        : "bg-white/5 border border-white/10 text-white rounded-tl-none",
                      msg.deleted && "opacity-40 italic bg-transparent border-dashed"
                    )}
                  >
                    {msg.deleted ? (
                      <em className="text-white/40">Message deleted</em>
                    ) : msg.role === "assistant" ? (
                      msg.content ? (
                        <div className="prose prose-invert prose-sm max-w-none">
                          <Markdown>{msg.content}</Markdown>
                        </div>
                      ) : (
                        <span className="opacity-40 text-xs uppercase tracking-widest animate-pulse">Waiting...</span>
                      )
                    ) : (
                      <Markdown>{msg.content}</Markdown>
                    )}
                  </div>
                  <span className="text-[10px] text-white/20 mt-1 uppercase tracking-tighter">
                    {msg.role === "user" ? "You" : "SafeAid"}
                  </span>
                </motion.div>
              ))}

              {isLoading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-2 text-white/40 text-[10px] font-bold uppercase tracking-widest ml-2"
                >
                  <Loader2 className="w-3 h-3 animate-spin" />
                  SafeAid is responding...
                </motion.div>
              )}

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-xs text-red-400 font-medium flex items-center justify-between gap-4"
                >
                  <span>{error}</span>
                  <button
                    onClick={() => {
                      setError(null);
                      const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
                      if (lastUserMsg) handleSend(lastUserMsg.content);
                    }}
                    className="flex items-center gap-1 px-3 py-1 bg-red-500/20 rounded-lg hover:bg-red-500/30 transition-colors shrink-0 font-bold uppercase tracking-tighter"
                  >
                    <RefreshCw className="w-3 h-3" />
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
                placeholder="Describe the emergency..."
                className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 pr-16 min-h-[60px] max-h-[120px] focus:outline-none focus:border-white/20 transition-colors resize-none text-sm disabled:opacity-50"
                disabled={isLoading || isLimitReached}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
              />
              <button
                onClick={() => handleSend()}
                disabled={isLoading || !input.trim() || isLimitReached}
                className="absolute bottom-3 right-3 p-2 bg-white text-black rounded-xl shadow-lg hover:bg-white/90 transition-all active:scale-[0.95] disabled:opacity-50"
              >
                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {SERVICES.map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                onClick={() => setSelectedService(s)}
                className="p-6 bg-white/5 border border-white/10 rounded-2xl flex flex-col items-center gap-2 hover:bg-white/10 transition-all active:scale-[0.98]"
              >
                <Icon className={cn("w-8 h-8", s.color)} />
                <span className="font-bold text-sm uppercase">{s.name}</span>
              </button>
            );
          })}
        </div>
      )}

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
                COPY
              </button>
              <button
                onClick={() => deleteMessage(contextMenu.messageId)}
                className="w-full flex items-center gap-3 px-3 py-2 text-xs font-bold text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
              >
                DELETE
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

