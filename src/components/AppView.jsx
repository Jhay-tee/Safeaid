import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { ArrowLeft, Activity, Heart, Shield, FileText, ChevronRight } from "lucide-react";
import { cn } from "../lib/utils";
import AIAssistant from "./AIAssistant";
import MedicalSummarizer from "./MedicalSummarizer";

const TOOLS = [
  { id: "health", name: "Health Assistant", icon: Heart, color: "text-pink-500", desc: "General health advice & symptom checker" },
  { id: "first-aid", name: "First Aid Guide", icon: Activity, color: "text-green-500", desc: "Step-by-step instructions for injuries" },
  { id: "emergency", name: "Emergency AI", icon: Shield, color: "text-red-500", desc: "Immediate life-saving instructions" },
  { id: "summarizer", name: "Medical Record Summarizer", icon: FileText, color: "text-blue-500", desc: "Upload reports for simple summaries" },
];

export default function AppView({ incrementUsage, isLimitReached, isAuth }) {
  const [selectedTool, setSelectedTool] = useState(null);
  const navigate = useNavigate(); // React Router

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="space-y-8"
    >
      <button
        onClick={() => navigate(-1)} // Fixed back button
        className="flex items-center gap-2 text-white/40 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Home
      </button>

      <AnimatePresence mode="wait">
        {!selectedTool ? (
          <motion.div
            key="tools"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            <div className="flex items-center justify-between px-2">
              <h2 className="text-2xl font-bold tracking-tight">AI Health Tools</h2>
              {!navigator.onLine && (
                <span className="text-xs font-bold text-red-500 bg-red-500/10 px-3 py-1 rounded-full">
                  OFFLINE — AI TOOLS UNAVAILABLE
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 gap-4">
              {TOOLS.map((tool) => (
                <button
                  key={tool.id}
                  onClick={() => setSelectedTool(tool.id)}
                  disabled={!navigator.onLine}
                  className={cn(
                    "flex items-center justify-between p-6 bg-white/5 border border-white/10 rounded-3xl transition-all group text-left",
                    !navigator.onLine ? "opacity-50 cursor-not-allowed" : "hover:bg-white/10 hover:border-white/20 active:scale-[0.99]"
                  )}
                >
                  <div className="flex items-center gap-4">
                    <div className={cn("p-4 rounded-2xl bg-white/5 group-hover:bg-white/10 transition-colors", tool.color)}>
                      <tool.icon className="w-8 h-8" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg">{tool.name}</h3>
                      <p className="text-sm text-white/40">{tool.desc}</p>
                    </div>
                  </div>
                  <ChevronRight className="w-6 h-6 text-white/20 group-hover:text-white/40 transition-colors" />
                </button>
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="assistant"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="space-y-6"
          >
            <button
              onClick={() => setSelectedTool(null)}
              className="flex items-center gap-2 text-white/40 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Tools
            </button>

            {selectedTool === "summarizer" ? (
              <MedicalSummarizer
                incrementUsage={incrementUsage}
                isLimitReached={isLimitReached}
              />
            ) : (
              <AIAssistant
                type={selectedTool}
                incrementUsage={incrementUsage}
                isLimitReached={isLimitReached}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
   }
