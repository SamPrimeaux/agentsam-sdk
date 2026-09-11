import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useOnline } from "@/hooks/use-online";
import { useWorkStore } from "@/lib/work/store";

export function OfflineBanner() {
  const [mounted, setMounted] = useState(false);
  const online = useOnline();
  const queued = useWorkStore((s) => s.offlineQueue.length);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Avoid SSR/client mismatch — navigator.onLine is only meaningful after mount.
  if (!mounted || online) return null;

  return (
    <div
      role="status"
      className="flex shrink-0 items-center gap-2 border-b border-border bg-card px-3 py-2 text-xs text-foreground"
    >
      <WifiOff className="size-3.5 shrink-0 text-stone" aria-hidden />
      <p className="min-w-0 flex-1 leading-snug">
        Offline — chats stay on this device. CLI still works.
        {queued > 0 ? ` ${queued} message${queued === 1 ? "" : "s"} queued.` : null}
      </p>
      <Link
        to="/cli"
        className="shrink-0 rounded-md px-2 py-1.5 font-medium text-accent underline-offset-2 hover:underline"
      >
        Open CLI
      </Link>
    </div>
  );
}
