import { motion } from "motion/react";
import { cn } from "../lib/utils";
import Markdown from "react-markdown";

export default function MessageItem({ message, onContextMenu }) {
  return (
    <motion.div
      key={message.id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      onContextMenu={(e) => onContextMenu(e, message)}
      onTouchStart={(e) => {
        const timer = setTimeout(() => onContextMenu(e, message), 500);
        e.currentTarget.dataset.timer = timer;
      }}
      onTouchEnd={(e) => clearTimeout(e.currentTarget.dataset.timer)}
      className={cn(
        "flex flex-col max-w-[85%] lg:max-w-[70%] group relative",
        message.role === "user" ? "ml-auto items-end" : "mr-auto items-start"
      )}
    >
      <div
        className={cn(
          "p-4 rounded-2xl text-sm md:text-base lg:text-lg lg:p-6 transition-all",
          message.role === "user"
            ? "bg-white text-black font-medium rounded-tr-none"
            : "bg-white/5 border border-white/10 text-white rounded-tl-none",
          message.deleted && "opacity-40 italic bg-transparent border-dashed"
        )}
      >
        {message.deleted ? (
          "Message was deleted"
        ) : message.role === "assistant" ? (
          message.content ? (
            <div className="prose prose-invert prose-sm lg:prose lg:prose-lg max-w-none">
              <Markdown>{message.content}</Markdown>
            </div>
          ) : (
            // ✅ Animated three dots (ChatGPT style)
            <div className="flex items-center gap-1 py-1">
              <span className="w-2 h-2 bg-white/40 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
              <span className="w-2 h-2 bg-white/40 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
              <span className="w-2 h-2 bg-white/40 rounded-full animate-bounce"></span>
            </div>
          )
        ) : (
          <div className="prose prose-sm max-w-none">
            <Markdown>{message.content}</Markdown>
          </div>
        )}
      </div>
      <span className="text-[10px] lg:text-xs text-white/20 mt-1 uppercase tracking-tighter">
        {message.role === "user" ? "You" : "SafeAid"}
      </span>
    </motion.div>
  );
}