import { motion, AnimatePresence } from "motion/react";
import { Copy, Trash2 } from "lucide-react";

export default function ContextMenu({ menu, onClose, onCopy, onDelete }) {
  if (!menu) return null;

  return (
    <AnimatePresence>
      <>
        <div className="fixed inset-0 z-[100]" onClick={onClose} />
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 10 }}
          style={{
            position: "fixed",
            left: Math.min(window.innerWidth - 150, menu.x),
            top: Math.min(window.innerHeight - 100, menu.y),
            zIndex: 101,
          }}
          className="bg-zinc-900 border border-white/10 rounded-xl p-1 shadow-2xl min-w-[140px]"
        >
          <button
            onClick={() => onCopy(menu.content)}
            className="w-full flex items-center gap-3 px-3 py-2 text-xs font-bold text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <Copy className="w-4 h-4" />
            COPY
          </button>
          <button
            onClick={() => onDelete(menu.messageId)}
            className="w-full flex items-center gap-3 px-3 py-2 text-xs font-bold text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            DELETE
          </button>
        </motion.div>
      </>
    </AnimatePresence>
  );
}