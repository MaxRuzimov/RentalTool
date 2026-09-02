import { Loader2 } from "lucide-react";

/** Shared inline loading spinner for filled/outlined buttons (spec §1.1). */
export default function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return <Loader2 className={`animate-spin ${className}`} aria-hidden="true" />;
}
