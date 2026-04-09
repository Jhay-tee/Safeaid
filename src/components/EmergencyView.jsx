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
  AlertTriangle,
} from "lucide-react";
import { cn } from "../lib/utils";
import Markdown from "react-markdown";
import { extractText } from "../utils/ChatHelpers";

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

  const [autoCallTimer, setAutoCallTimer] = useState(null);
  const [pendingAutoCall, setPendingAutoCall] = useState(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  useEffect(() => {
    return () => {
      if (autoCallTimer) clearInterval(autoCallTimer);
    };
  }, [autoCallTimer]);

  const handleBack = () => {
    if (selectedService) setSelectedService(null);
    else navigate(-1);
  };

  const startAutoCallCountdown = (service, number) => {
    let countdown = 3;
    setAutoCallTimer(countdown);

    const interval = setInterval(() => {
      countdown -= 1;
      setAutoCallTimer(countdown);
      if (countdown <= 0) {
        clearInterval(interval);
        setAutoCallTimer(null);
        window.location.href = `tel:${number}`;
        setPendingAutoCall(null);
      }
    }, 1000);

    setAutoCallTimer(interval);
  };

  const cancelAutoCall = () => {
    if (autoCallTimer) {
      clearInterval(autoCallTimer);
      setAutoCallTimer(null);
    }
    setPendingAutoCall(null);
  };

  const handleSend = async (retryInput) => {
    const textToUse = retryInput || input;
    if (!textToUse.trim() || isLoading) return;

    const now = Date.now();
    if (now - lastRequestTime < 2000) {
      setError("Message didn't go through. Please click retry.");
      console.error("[SafeAid] Rate limit hit:", { now, lastRequestTime });
      return;
    }
    setLastRequestTime(now);

    if (isLimitReached) {
      setError("Message didn't go through. Please click retry.");
      console.error("[SafeAid] Usage limit reached.");
      return;
    }

    // ✅ Build context: last assistant message + new user message
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
        body: JSON.stringify({ 
          message: textToUse, 
          type: "emergency",
          context: contextMessages,   // ✅ Send context
        }),
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
        setError("Message didn't go through. Please click retry.");
        console.error("[SafeAid] API error:", { status: res.status, errMsg });
        setIsLoading(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let fullResponse = "";

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

          if (parsed.error) {
            setMessages((prev) => prev.filter((m) => m.id !== aiMessageId));
            setError("Message didn't go through. Please click retry.");
            console.error("[SafeAid] Stream error:", parsed.error);
            setIsLoading(false);
            return;
          }

          const text = extractText(parsed);
          if (!text) continue;

          fullResponse += text;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aiMessageId ? { ...m, content: fullResponse } : m
            )
          );
        }
      }

      let finalContent = fullResponse;
      let criticalTrigger = null;
      let infoTrigger = null;

      const criticalMatch = finalContent.match(/\[TRIGGER_EMERGENCY_CRITICAL:(\w+)\]/i);
      if (criticalMatch) {
        criticalTrigger = criticalMatch[1].toLowerCase();
        finalContent = finalContent.replace(criticalMatch[0], "").trim();
      } else {
        const infoMatch = finalContent.match(/\[TRIGGER_EMERGENCY:(\w+)\]/i);
        if (infoMatch) {
          infoTrigger = infoMatch[1].toLowerCase();
          finalContent = finalContent.replace(infoMatch[0], "").trim();
        }
      }

      // ✅ Fallback: severe keyword detection
      if (!criticalTrigger && !infoTrigger) {
        const userMessageLower = textToUse.toLowerCase();
        const serviceKeywords = {
          ambulance: [
            "bleeding heavily", "bleeding out", "unconscious", "chest wound",
            "heart attack", "can't breathe", "severe bleeding", "dying",
            "stroke", "seizure", "not breathing", "no pulse", "chest pain",
            "accident", "injury", "broken bone", "fracture", "medical emergency"
          ],
          police: [
            "robbery", "stolen", "thief", "burglary", "attack", "assault",
            "kidnap", "violence", "gun", "weapon", "crime", "suspicious",
            "trespass", "vandalism", "fight", "threat"
          ],
          fire: [
            "fire", "burning", "smoke", "flame", "explosion", "gas leak",
            "inferno", "blaze", "fire outbreak"
          ]
        };

        for (const [serviceId, keywords] of Object.entries(serviceKeywords)) {
          if (keywords.some(keyword => userMessageLower.includes(keyword))) {
            criticalTrigger = serviceId;
            console.log(`[SafeAid] Fallback triggered: "${serviceId}" keywords detected.`);
            break;
          }
        }

        if (!criticalTrigger) {
          if (userMessageLower.includes("call police") || userMessageLower.includes("police number")) {
            infoTrigger = "police";
          } else if (userMessageLower.includes("call fire") || userMessageLower.includes("fire service")) {
            infoTrigger = "fire";
          } else if (userMessageLower.includes("call ambulance") || userMessageLower.includes("ambulance number")) {
            infoTrigger = "ambulance";
          }
        }
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === aiMessageId ? { ...m, content: finalContent } : m
        )
      );

      const serviceId = criticalTrigger || infoTrigger;
      if (serviceId) {
        const service = SERVICES.find((s) => s.id === serviceId);
        if (service) {
          setSelectedService(service);
          if (criticalTrigger) {
            const firstNumber = service.numbers[0];
            setPendingAutoCall({ service, number: firstNumber });
            startAutoCallCountdown(service, firstNumber);
          }
        }
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

      {/* Limit Reached Banner */}
      {isLimitReached && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center gap-3 text-amber-400 text-sm">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>You've reached the free usage limit. Please sign in to continue.</span>
        </div>
      )}

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

            {pendingAutoCall && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-red-500/20 border border-red-500 rounded-xl p-4 text-center"
              >
                <p className="font-bold text-red-400">
                  ⚠️ CRITICAL: Auto-calling {pendingAutoCall.service.name} in {autoCallTimer} seconds...
                </p>
                <button
                  onClick={cancelAutoCall}
                  className="mt-2 px-4 py-2 bg-white/10 rounded-lg text-sm font-bold hover:bg-white/20"
                >
                  Cancel Auto-Call
                </button>
              </motion.div>
            )}

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
                        <div className="flex items-center gap-1 py-1">
                          <span className="w-2 h-2 bg-white/40 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                          <span className="w-2 h-2 bg-white/40 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                          <span className="w-2 h-2 bg-white/40 rounded-full animate-bounce"></span>
                        </div>
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
                placeholder={isLimitReached ? "Sign in to continue..." : "Describe the emergency..."}
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