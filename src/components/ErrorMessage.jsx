import { motion } from "motion/react";

export default function ErrorMessage({ error, onRetry }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 lg:p-6 bg-red-500/10 border border-red-500/20 rounded-2xl text-xs lg:text-sm text-red-400 font-medium flex items-center justify-between gap-4"
    >
      <span>{error}</span>
      <button
        onClick={onRetry}
        className="px-3 py-1 bg-red-500/20 rounded-lg hover:bg-red-500/30 transition-colors shrink-0 font-bold uppercase tracking-tighter"
      >
        Retry
      </button>
    </motion.div>
  );
}