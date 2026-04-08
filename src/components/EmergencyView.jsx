import { useState, useEffect } from "react";
import { motion } from "motion/react";
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
    numbers: [
      "+2348000022322",
      "+2348000022422",
      "+2348037343628",
      "+2348033597921",
    ],
    icon: Ambulance,
    color: "text-red-500",
  },
  {
    id: "police",
    name: "Police",
    numbers: [
      "+2348039213071",
      "+2348028916010",
      "+2348020913810",
      "+2349040000065",
      "+2349169839215",
    ],
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

export default function EmergencyView({
  onBack,
  incrementUsage,
  isLimitReached,
}) {
  const [selectedService, setSelectedService] = useState(null);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastRequestTime, setLastRequestTime] = useState(0);

  useEffect(() => {
    const handleTrigger = (e) => {
      const serviceId = e.detail.service;
      const service = SERVICES.find((s) => s.id === serviceId);
      if (service) {
        setSelectedService(service);
      }
    };

    window.addEventListener("trigger-emergency", handleTrigger);
    return () =>
      window.removeEventListener("trigger-emergency", handleTrigger);
  }, []);

  const handleSend = async (retryInput) => {
    const textToUse = retryInput || input;
    if (!textToUse.trim() || isLoading) return;

    const now = Date.now();
    if (now - lastRequestTime < 2000) {
      setError("Please wait a moment before sending another request.");
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
        body: JSON.stringify({ message: textToUse, type: "emergency" }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

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

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split("\n\n");
        buffer = parts.pop();

        for (const part of parts) {
          if (part.startsWith("data:")) {
            try {
              const jsonStr = part.replace(/^data:\s*/, "");
              const { text } = JSON.parse(jsonStr);

              const triggerMatch = text.match(
                /\[TRIGGER_EMERGENCY:(\w+)\]/i
              );
              let cleanText = text;
              if (triggerMatch) {
                const service = triggerMatch[1].toLowerCase();
                cleanText = text.replace(triggerMatch[0], "").trim();
                window.dispatchEvent(
                  new CustomEvent("trigger-emergency", {
                    detail: { service },
                  })
                );
              }

              setMessages((prev) =>
                prev.map((m) =>
                  m.id === aiMessageId
                    ? { ...m, content: m.content + cleanText }
                    : m
                )
              );
            } catch (err) {
              console.error("Stream parse error:", err);
            }
          }
        }
      }

      incrementUsage();
    } catch (err) {
      console.error("Chat Error:", err);
      setError(
        err.name === "AbortError"
          ? "Request timed out."
          : err.message
      );
    } finally {
      setIsLoading(false);
    }
  };
if (selectedService) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="space-y-8"
    >
      <button
        onClick={() => setSelectedService(null)}
        className="flex items-center gap-2 text-white/40 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4 lg:w-5 lg:h-5" />
        Back to Services
      </button>

      <div className="text-center space-y-6">
        <div
          className={cn(
            "inline-flex p-6 rounded-full bg-white/5",
            selectedService.color
          )}
        >
          <selectedService.icon className="w-16 h-16 lg:w-20 lg:h-20" />
        </div>
        <h2 className="text-3xl lg:text-4xl font-bold tracking-tight">
          {selectedService.name}
        </h2>

        {/* Multiple numbers rendered as Line 1, Line 2 with subtitle */}
        <div className="flex flex-col gap-6">
          {selectedService.numbers.map((num, idx) => (
            <a
              key={num}
              href={`tel:${num}`}
              className="flex flex-col items-center justify-center w-full py-12 lg:py-16 bg-white text-black font-bold rounded-3xl transition-all active:scale-[0.98] hover:bg-white/90 gap-4"
            >
              <Phone className="w-12 h-12 lg:w-16 lg:h-16 fill-current" />
              <span className="text-4xl lg:text-5xl font-black tracking-tighter uppercase">
                CALL LINE {idx + 1}
              </span>
              <span className="text-xs lg:text-sm opacity-60">{num}</span>
            </a>
          ))}
        </div>
      </div>

      {/* AI Help Section */}
      <div className="space-y-4 pt-8 border-t border-white/10">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">
            What's happening? (Optional AI Help)
          </h3>
          {!navigator.onLine && (
            <span className="text-[10px] font-bold bg-red-500/20 text-red-400 px-2 py-1 rounded-full">
              OFFLINE — AI DISABLED
            </span>
          )}
        </div>
        <div className="relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe the emergency for first-aid steps..."
            className="w-full bg-white/5 border border-white/10 backdrop-blur-md rounded-3xl p-6 lg:p-8 min-h-[120px] lg:min-h-[160px] focus:outline-none focus:border-white/20 transition-colors resize-none lg:text-base"
            disabled={isLoading}
          />
          <button
            onClick={() => handleSend()}
            disabled={isLoading || !input.trim()}
            className="absolute bottom-4 right-4 p-3 lg:p-4 bg-white text-black font-bold rounded-xl hover:bg-white/90 transition-all active:scale-[0.98] disabled:opacity-50"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 lg:w-6 lg:h-6 animate-spin" />
            ) : (
              <Send className="w-5 h-5 lg:w-6 lg:h-6" />
            )}
          </button>
        </div>

        {isLoading && (
          <div className="flex items-center gap-2 text-white/40 text-sm lg:text-base">
            <Loader2 className="w-4 h-4 lg:w-5 lg:h-5 animate-spin" />
            Sending...
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl space-y-3">
            <p className="text-red-400 text-sm">{error}</p>
            <button
              onClick={() => handleSend()}
              className="flex items-center gap-2 text-xs lg:text-sm font-bold text-red-400 hover:text-red-300"
            >
              <RefreshCw className="w-3 h-3 lg:w-4 lg:h-4" />
              RETRY
            </button>
          </div>
        )}

        {messages
          .filter((m) => m.role === "assistant")
          .map((m) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-6 bg-white/5 border border-white/10 rounded-2xl prose prose-invert max-w-none"
            >
              <Markdown>{m.content}</Markdown>
            </motion.div>
          ))}
      </div>
    </motion.div>
  );
}

return (
  <motion.div
    initial={{ opacity: 0, x: -20 }}
    animate={{ opacity: 1, x: 0 }}
    className="space-y-8"
  >
    <button
      onClick={onBack}
      className="flex items-center gap-2 text-white/40 hover:text-white transition-colors"
    >
      <ArrowLeft className="w-4 h-4" />
      Back to Home
    </button>

    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-6">
      {SERVICES.map((service) => (
        <button
          key={service.id}
          onClick={() => setSelectedService(service)}
          className="flex flex-col items-center justify-center gap-4 p-8 bg-white/5 border border-white/10 rounded-3xl hover:bg-white/10 hover:border-white/20 transition-all active:scale-[0.98]"
        >
          <service.icon
            className={cn("w-10 h-10 lg:w-12 lg:h-12", service.color)}
          />
          <span className="font-bold text-sm lg:text-base tracking-tight uppercase">
            {service.name}
          </span>
        </button>
      ))}
    </div>
  </motion.div>
);
