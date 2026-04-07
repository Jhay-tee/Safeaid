import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Phone, ArrowLeft, Ambulance, Shield, Flame, UserPlus, Send, Loader2, RefreshCw } from "lucide-react";
import { cn } from "../lib/utils";
import Markdown from "react-markdown";

const SERVICES = [
  { id: "ambulance", name: "Ambulance", number: "999", icon: Ambulance, color: "text-red-500" },
  { id: "police", name: "Police", number: "999", icon: Shield, color: "text-blue-500" },
  { id: "fire", name: "Fire Service", number: "999", icon: Flame, color: "text-orange-500" },
  { id: "contact", name: "Emergency Contact", number: "07000000000", icon: UserPlus, color: "text-green-500" },
];

export default function EmergencyView({ onBack, incrementUsage, isLimitReached }) {
  const [selectedService, setSelectedService] = useState(null);
  const [input, setInput] = useState("");
  const [aiResponse, setAiResponse] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const handleTrigger = (e) => {
      const serviceId = e.detail.service;
      const service = SERVICES.find(s => s.id === serviceId);
      if (service) {
        setSelectedService(service);
      }
    };

    window.addEventListener("trigger-emergency", handleTrigger);
    return () => window.removeEventListener("trigger-emergency", handleTrigger);
  }, []);

  const handleSend = async (retryInput) => {
    const textToUse = retryInput || input;
    if (!textToUse.trim()) return;
    if (isLimitReached) {
      setError("You've reached your limit. Please sign in to continue.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setAiResponse(null);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: textToUse, type: "emergency" }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || `Request failed with status ${res.status}`);
      }
      
      setAiResponse(data.text);
      incrementUsage();
    } catch (err) {
      console.error("Emergency AI Error:", err);
      if (err.name === "AbortError") {
        setError("Request is taking too long. Please check your internet connection.");
      } else {
        setError(err.message || "Request failed. Please check your connection.");
      }
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
        <button onClick={() => setSelectedService(null)} className="flex items-center gap-2 text-white/40 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to Services
        </button>

        <div className="text-center space-y-6">
          <div className={cn("inline-flex p-6 rounded-full bg-white/5", selectedService.color)}>
            <selectedService.icon className="w-16 h-16" />
          </div>
          <h2 className="text-3xl font-bold tracking-tight">{selectedService.name}</h2>
          
          <a
            href={`tel:${selectedService.number}`}
            className="flex flex-col items-center justify-center w-full py-12 bg-white text-black font-bold rounded-3xl transition-all active:scale-[0.98] hover:bg-white/90 gap-4"
          >
            <Phone className="w-12 h-12 fill-current" />
            <span className="text-4xl font-black tracking-tighter uppercase">CALL NOW</span>
            <span className="text-xl font-medium opacity-60">{selectedService.number}</span>
          </a>
        </div>

        <div className="space-y-4 pt-8 border-t border-white/10">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">What's happening? (Optional AI Help)</h3>
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
              className="w-full bg-white/5 border border-white/10 backdrop-blur-md rounded-3xl p-6 min-h-[120px] focus:outline-none focus:border-white/20 transition-colors resize-none"
              disabled={isLoading}
            />
            <button
              onClick={() => handleSend()}
              disabled={isLoading || !input.trim()}
              className="absolute bottom-4 right-4 p-3 bg-white text-black font-bold rounded-xl hover:bg-white/90 transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </div>

          {isLoading && (
            <div className="flex items-center gap-2 text-white/40 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Sending...
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl space-y-3">
              <p className="text-red-400 text-sm">{error}</p>
              <button 
                onClick={() => handleSend()}
                className="flex items-center gap-2 text-xs font-bold text-red-400 hover:text-red-300"
              >
                <RefreshCw className="w-3 h-3" />
                RETRY
              </button>
            </div>
          )}

          {aiResponse && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-6 bg-white/5 border border-white/10 rounded-2xl prose prose-invert max-w-none"
            >
              <Markdown>{aiResponse}</Markdown>
            </motion.div>
          )}
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
      <button onClick={onBack} className="flex items-center gap-2 text-white/40 hover:text-white transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Back to Home
      </button>

      <div className="grid grid-cols-2 gap-4">
        {SERVICES.map((service) => (
          <button
            key={service.id}
            onClick={() => setSelectedService(service)}
            className="flex flex-col items-center justify-center gap-4 p-8 bg-white/5 border border-white/10 rounded-3xl hover:bg-white/10 hover:border-white/20 transition-all active:scale-[0.98]"
          >
            <service.icon className={cn("w-10 h-10", service.color)} />
            <span className="font-bold text-sm tracking-tight uppercase">{service.name}</span>
          </button>
        ))}
      </div>
    </motion.div>
  );
}
