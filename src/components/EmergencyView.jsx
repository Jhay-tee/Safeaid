import { useState, useEffect, useRef } from "react";
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

// Typing effect for AI messages
function TypingText({ text, speed = 15, onComplete }) {
  const [displayed, setDisplayed] = useState("");
  const indexRef = useRef(0);

  useEffect(() => {
    if (indexRef.current >= text.length) {
      if (onComplete) onComplete();
      return;
    }
    const interval = setInterval(() => {
      setDisplayed((prev) => prev + text[indexRef.current]);
      indexRef.current += 1;
      if (indexRef.current >= text.length) {
        clearInterval(interval);
        if (onComplete) onComplete();
      }
    }, speed);
    return () => clearInterval(interval);
  }, [text, speed, onComplete]);

  return <Markdown>{displayed}</Markdown>;
}

export default function EmergencyView({ onBack, incrementUsage, isLimitReached }) {
  const [selectedService, setSelectedService] = useState(null);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastRequestTime, setLastRequestTime] = useState(0);
  const [contextMenu, setContextMenu] = useState(null);

  // Listen to emergency triggers
  useEffect(() => {
    const handleTrigger = (e) => {
      const service = SERVICES.find((s) => s.id === e.detail.service);
      if (service) setSelectedService(service);
    };
    window.addEventListener("trigger-emergency", handleTrigger);
    return () => window.removeEventListener("trigger-emergency", handleTrigger);
  }, []);

  // Long press for context menu
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
      {/* Back Button */}
      <button
        onClick={() => (selectedService ? setSelectedService(null) : onBack())}
        className="flex items-center gap-2 text-white/40 hover:text-white"
      >
        <ArrowLeft className="w-4 h-4" />
        {selectedService ? "Back to Services" : "Back"}
      </button>

      {selectedService ? (
        <>
          {/* Service Info */}
          <div className="text-center space-y-6">
            <div className={cn("inline-flex p-6 rounded-full bg-white/5", selectedService.color)}>
              {(() => {
                const Icon = selectedService.icon;
                return <Icon className="w-16 h-16" />;
              })()}
            </div>
            <h2 className="text-3xl font-bold">{selectedService.name}</h2>

            {/* Call Buttons */}
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

          {/* Chat Area */}
          <div className="space-y-4 pt-6 max-h-[60vh] overflow-y-auto">
            {/* Input */}
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Describe emergency..."
              className="w-full p-4 bg-white/5 rounded-xl resize-none"
              disabled={isLoading}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <button
              onClick={() => handleSend()}
              disabled={isLoading || !input.trim()}
              className="p-3 bg-white text-black rounded-xl disabled:opacity-50 mt-2"
            >
              {isLoading ? <Loader2 className="animate-spin" /> : <Send />}
            </button>

            {/* Error */}
            {error && (
              <div className="text-red-400 flex items-center gap-2 mt-2">
                {error}
                <button
                  onClick={() => {
                    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
                    if (lastUserMsg) handleSend(lastUserMsg.content);
                    else handleSend();
                  }}
                >
                  <RefreshCw />
                </button>
              </div>
            )}

            {/* Messages */}
            <div className="flex flex-col gap-3 mt-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "p-3 rounded-xl max-w-[75%] break-words",
                    msg.role === "user"
                      ? "self-end bg-blue-600 text-white"
                      : "self-start bg-zinc-800 text-white"
                  )}
                  onContextMenu={(e) => handleLongPress(e, msg)}
                >
                  {msg.deleted ? (
                    <em className="text-gray-400">Message deleted</em>
                  ) : msg.isNew ? (
                    <TypingText
                      text={msg.content}
                      onComplete={() =>
                        setMessages((prev) =>
                          prev.map((m) => (m.id === msg.id ? { ...m, isNew: false } : m))
                        )
                      }
                    />
                  ) : (
                    <Markdown>{msg.content}</Markdown>
                  )}
                </div>
              ))}
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
                className="p-6 bg-white/5 rounded-2xl flex flex-col items-center gap-2"
              >
                <Icon className={cn("w-8 h-8", s.color)} />
                <span className="font-bold text-sm uppercase">{s.name}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Context Menu */}
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
