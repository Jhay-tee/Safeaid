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
      if (service) setSelectedService(service);
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
      setError(
        err.name === "AbortError"
          ? "Request timed out."
          : err.message
      );
    } finally {
      setIsLoading(false);
    }
  };

  // =========================
  // SERVICE VIEW
  // =========================
  if (selectedService) {
    return (
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="space-y-8"
      >
        <button
          onClick={() => setSelectedService(null)}
          className="flex items-center gap-2 text-white/40 hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Services
        </button>

        <div className="text-center space-y-6">
          <div
            className={cn(
              "inline-flex p-6 rounded-full bg-white/5",
              selectedService.color
            )}
          >
            <selectedService.icon className="w-16 h-16" />
          </div>

          <h2 className="text-3xl font-bold">
            {selectedService.name}
          </h2>

          <div className="flex flex-col gap-6">
            {selectedService.numbers.map((num, idx) => (
              <a
                key={num}
                href={`tel:${num}`}
                className="flex flex-col items-center justify-center py-12 bg-white text-black font-bold rounded-3xl"
              >
                <Phone className="w-12 h-12" />
                CALL LINE {idx + 1}
                <span className="text-xs">{num}</span>
              </a>
            ))}
          </div>
        </div>

        {/* AI SECTION */}
        <div className="space-y-4 pt-8 border-t border-white/10">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe the emergency..."
            className="w-full p-4 rounded-xl bg-white/5"
          />

          <button onClick={handleSend}>
            {isLoading ? "Sending..." : "Send"}
          </button>

          {isLoading && <p>Loading...</p>}

          {error && <p className="text-red-400">{error}</p>}

          {messages.map((m) => (
            <Markdown key={m.id}>{m.content}</Markdown>
          ))}
        </div>
      </motion.div>
    );
  }

  // =========================
  // HOME VIEW
  // =========================
  return (
    <motion.div>
      <button onClick={onBack}>Back</button>

      {SERVICES.map((service) => (
        <button
          key={service.id}
          onClick={() => setSelectedService(service)}
        >
          {service.name}
        </button>
      ))}
    </motion.div>
  );
    }
