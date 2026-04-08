import { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { AlertCircle, Shield, Activity, Download } from "lucide-react";
import EmergencyView from "./components/EmergencyView";
import AppView from "./components/AppView";
import AuthButton from "./components/AuthButton";

function Landing({ deferredPrompt, handleInstallClick }) {
  const navigate = useNavigate();

  return (
    <motion.div
      key="landing"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex flex-col gap-8 items-center justify-center min-h-[60vh] text-center"
    >
      <div className="space-y-4">
        <h1 className="text-4xl md:text-6xl font-bold tracking-tighter">
          Emergency & Health <br />
          <span className="text-white/60">AI Assistant</span>
        </h1>
        <p className="text-white/40 max-w-md mx-auto">
          Immediate response for emergencies and intelligent health support when you need it most.
        </p>
        <div className="flex items-center justify-center gap-2 text-[10px] font-bold text-green-500/60 uppercase tracking-widest">
          <Shield className="w-3 h-3" />
          Offline Ready for Emergencies
        </div>
      </div>

      {deferredPrompt && (
        <motion.button
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          onClick={handleInstallClick}
          className="px-6 py-3 bg-white/10 border border-white/20 rounded-full text-xs font-bold flex items-center gap-2 hover:bg-white/20 transition-all"
        >
          <Download className="w-4 h-4" />
          INSTALL FOR OFFLINE ACCESS
        </motion.button>
      )}

      <div className="flex flex-col w-full gap-4 max-w-sm">
        <button
          onClick={() => navigate("/emergency")}
          className="w-full py-6 bg-white text-black font-bold text-xl rounded-2xl transition-all active:scale-[0.98] hover:bg-white/90 flex items-center justify-center gap-3"
        >
          <AlertCircle className="w-6 h-6" />
          EMERGENCY
        </button>
        
        <button
          onClick={() => navigate("/app")}
          className="w-full py-6 bg-white/5 text-white font-bold text-xl rounded-2xl border border-white/10 transition-all active:scale-[0.98] hover:bg-white/10 flex items-center justify-center gap-3"
        >
          <Activity className="w-6 h-6" />
          ENTER APP
        </button>
      </div>
    </motion.div>
  );
}

export default function App() {
  const [isAuth, setIsAuth] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  // Usage tracking
  const [usage, setUsage] = useState(() => {
    const saved = localStorage.getItem("safeaid_usage");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const now = Date.now();
        if (now - (parsed.lastReset || 0) > 3600000) {
          return { count: 0, lastReset: now };
        }
        return parsed;
      } catch {
        return { count: 0, lastReset: Date.now() };
      }
    }
    return { count: 0, lastReset: Date.now() };
  });

  useEffect(() => {
    localStorage.setItem("safeaid_usage", JSON.stringify(usage));
  }, [usage]);

  const incrementUsage = () => {
    setUsage((prev) => ({ ...prev, count: (prev.count || 0) + 1 }));
  };

  const limit = isAuth ? 20 : 10;
  const isLimitReached = usage.count >= limit;

  // Install prompt
  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setDeferredPrompt(null);
  };

  // Offline detection
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return (
    <Router>
      <div className="min-h-screen bg-black text-white font-sans selection:bg-white selection:text-black">
        {/* Offline Banner */}
        <AnimatePresence>
          {isOffline && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-red-600 text-white text-center text-xs font-bold py-1 overflow-hidden"
            >
              OFFLINE MODE — EMERGENCY FEATURES ONLY
            </motion.div>
          )}
        </AnimatePresence>

        {/* Header */}
        <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 bg-black/80 backdrop-blur-md border-b border-white/10">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => window.location.href = "/"}>
            <Shield className="w-6 h-6 text-white" />
            <span className="text-xl font-bold tracking-tight">SafeAid</span>
          </div>
          <div className="flex items-center gap-2 md:gap-4">
            {deferredPrompt && (
              <button
                onClick={handleInstallClick}
                className="flex items-center gap-2 px-3 py-2 bg-white/10 text-white rounded-full text-[10px] md:text-xs font-bold hover:bg-white/20 transition-all"
              >
                <Download className="w-3 h-3 md:w-4 h-4" />
                <span className="hidden xs:inline">INSTALL</span>
                <span className="inline xs:hidden">APP</span>
              </button>
            )}
            <AuthButton isAuth={isAuth} onToggle={() => setIsAuth(prev => !prev)} />
          </div>
        </header>

        {/* Main Content */}
        <main className="pt-24 pb-12 px-6 max-w-2xl mx-auto">
          <Routes>
            <Route path="/" element={<Landing deferredPrompt={deferredPrompt} handleInstallClick={handleInstallClick} />} />
            <Route path="/emergency" element={<EmergencyView incrementUsage={incrementUsage} isLimitReached={isLimitReached} />} />
            <Route path="/app" element={<AppView incrementUsage={incrementUsage} isLimitReached={isLimitReached} isAuth={isAuth} />} />
          </Routes>
        </main>

        {/* Usage Indicator */}
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 bg-white/5 border border-white/10 rounded-full text-xs text-white/40 backdrop-blur-sm">
          Usage: {usage.count}/{limit} requests this hour
        </div>
      </div>
    </Router>
  );
}
