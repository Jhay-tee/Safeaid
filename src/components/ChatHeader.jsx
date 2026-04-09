import { cn } from "../lib/utils";

export default function ChatHeader({ config, messageCount, onClear }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-4">
        <div className={cn("p-3 rounded-xl bg-white/5", config.color)}>
          <config.icon className="w-6 h-6 lg:w-8 lg:h-8" />
        </div>
        <h2 className="text-xl lg:text-2xl font-bold tracking-tight">{config.name}</h2>
      </div>
      {messageCount > 0 && (
        <button
          onClick={onClear}
          className="text-[10px] font-bold text-white/20 hover:text-white/40 uppercase tracking-widest transition-colors"
        >
          Clear Chat
        </button>
      )}
    </div>
  );
}