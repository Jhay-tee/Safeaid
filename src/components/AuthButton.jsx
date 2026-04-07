import { User } from "lucide-react";
import { cn } from "../lib/utils";

export default function AuthButton({ isAuth }) {
  return (
    <button
      disabled
      className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium bg-white/5 text-white/40 border border-white/10 cursor-not-allowed"
    >
      <User className="w-4 h-4" />
      Sign In (Coming Soon)
    </button>
  );
}
