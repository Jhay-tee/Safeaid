import { Send, Loader2 } from "lucide-react";

export default function ChatInput({ value, onChange, onSend, isLoading, placeholder }) {
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="relative">
      <textarea
        value={value}
        onChange={onChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full bg-white/5 border border-white/10 backdrop-blur-md rounded-2xl p-4 pr-16 lg:p-5 min-h-[60px] lg:min-h-[80px] max-h-[120px] lg:max-h-[220px] focus:outline-none focus:border-white/20 transition-colors resize-none text-sm lg:text-base disabled:opacity-50"
        disabled={isLoading}
      />
      <button
        onClick={() => onSend()}
        disabled={isLoading || !value.trim()}
        className="absolute bottom-3 right-3 p-2 bg-white text-black rounded-xl shadow-lg hover:bg-white/90 transition-all active:scale-[0.95] disabled:opacity-50"
      >
        {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
      </button>
    </div>
  );
}