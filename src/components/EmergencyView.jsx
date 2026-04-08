import { useState, useEffect, useRef } from "react";
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

export default function EmergencyView({ onBack, incrementUsage, isLimitReached }) {
  const [selectedService, setSelectedService] = useState(null);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastRequestTime, setLastRequestTime] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef(null);

  // Listen for emergency triggers
  useEffect(() => {
    const handleTrigger = (e) => {
      const service = SERVICES.find((s) => s.id === e.detail.service);
      if (service) setSelectedService(service);
    };
    window.addEventListener("trigger-emergency", handleTrigger);
    return () => window.removeEventListener("trigger-emergency", handleTrigger);
  }, []);

  // Auto-scroll on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const now = Date.now();
    if (now - lastRequestTime < 2000) {
      setError("Slow down a bit...");
      return;
    }
    setLastRequestTime(now);

    if (isLimitReached) {
      setError("Limit reached.");
      return;
    }

    const userMsg = { id: Date.now().toString(), role: "user", content: input };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);
    setError(null);
    setIsTyping(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg.content, type: "emergency" }),
      });

      if (!res.ok || !res.body) throw new Error("Bad response");

      const aiId = (Date.now() + 1).toString();
      setMessages((prev) => [...prev, { id: aiId, role: "assistant", content: "" }]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let buffer = "";

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        buffer += decoder.decode(value || new Uint8Array(), { stream: true });

        const chunks = buffer.split("data:");
        buffer = chunks.pop(); // incomplete chunk stays

        for (let chunk of chunks) {
          chunk = chunk.trim();
          if (!chunk) continue;

          let text = "";
          try {
            const json = JSON.parse(chunk);
            text = json?.text || "";
          } catch {
            text = chunk;
          }

          // Handle emergency triggers immediately
          const triggerMatch = text.match(/\[TRIGGER_EMERGENCY:(\w+)\]/i);
          if (triggerMatch) {
            const service = triggerMatch[1].toLowerCase();
            window.dispatchEvent(
              new CustomEvent("trigger-emergency", { detail: { service } })
            );
            text = text.replace(triggerMatch[0], "").trim();
          }

          if (text) {
            // Split text by words for smoother typing
            const words = text.split(/(\s+)/);
            for (let word of words) {
              if (!word) continue;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === aiId ? { ...m, content: m.content + word } : m
                )
              );
              await new Promise((r) => setTimeout(r, 20)); // 20ms per word
            }
          }
        }
      }

      // Append leftover buffer
      if (buffer.trim()) {
        const words = buffer.trim().split(/(\s+)/);
        for (let word of words) {
          if (!word) continue;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aiId ? { ...m, content: m.content + word } : m
            )
          );
          await new Promise((r) => setTimeout(r, 20));
        }
      }

      incrementUsage();
    } catch (err) {
      setError("Something went wrong.");
    } finally {
      setIsLoading(false);
      setIsTyping(false);
    }
  };

  return (
    <motion.div className="space-y-8">
      <button
        onClick={() => (selectedService ? setSelectedService(null) : onBack())}
        className="flex items-center gap-2 text-white/40 hover:text-white"
      >
        <ArrowLeft className="w-4 h-4" />
        {selectedService ? "Back to Services" : "Back"}
      </button>

      {selectedService ? (
        <>
          <div className="text-center space-y-6">
            <div className={cn("inline-flex p-6 rounded-full bg-white/5", selectedService.color)}>
              {(() => { const Icon = selectedService.icon; return <Icon className="w-16 h-16" />; })()}
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
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Describe emergency..."
              className="w-full p-4 bg-white/5 rounded-xl"
              disabled={isLoading}
            />

            <button
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              className="p-3 bg-white text-black rounded-xl disabled:opacity-50"
            >
              {isLoading ? <Loader2 className="animate-spin" /> : <Send />}
            </button>

            {error && (
              <div className="text-red-400 flex items-center gap-2">
                {error}
                <button onClick={handleSend}><RefreshCw /></button>
              </div>
            )}

            {messages
              .filter((m) => m.role === "assistant")
              .map((m) => (
                <div key={m.id} className="prose prose-invert">
                  <Markdown>{m.content}</Markdown>
                </div>
              ))}

            {isTyping && (
              <div className="prose prose-invert text-gray-400 italic">Assistant is typing...</div>
            )}

            <div ref={chatEndRef} />
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
    </motion.div>
  );
              }
