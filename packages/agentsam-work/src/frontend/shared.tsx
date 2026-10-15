import { X } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";

/** Runs an async action with busy/error state; surfaces the host's error message instead of failing silently. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, run, setError };
}

export function Drawer({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="aw-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="aw-drawer" role="dialog" aria-modal="true" aria-label={title}>
        <header className="aw-drawer__head">
          <h2>{title}</h2>
          <button type="button" className="aw-icon-btn" aria-label="Close" onClick={onClose}>
            <X size={16} />
          </button>
        </header>
        <div className="aw-drawer__body">{children}</div>
        {footer ? <footer className="aw-drawer__foot">{footer}</footer> : null}
      </aside>
    </div>
  );
}

export function Field({ label, children, full }: { label: string; children: ReactNode; full?: boolean }) {
  return (
    <label className="aw-field" data-full={full || undefined}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Pill({ tone = "neutral", children }: { tone?: "neutral" | "accent" | "success" | "warning" | "danger"; children: ReactNode }) {
  return (
    <span className="aw-pill" data-tone={tone}>
      {children}
    </span>
  );
}

export function ErrorLine({ message }: { message: string | null }) {
  return message ? (
    <div className="aw-error" role="alert">
      {message}
    </div>
  ) : null;
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="agentsam-work-empty aw-empty">
      <strong>{title}</strong>
      {hint ? <span>{hint}</span> : null}
      {action}
    </div>
  );
}

/* ----------------------------- date helpers ----------------------------- */

const pad = (n: number) => String(n).padStart(2, "0");

/** ISO (UTC) -> value for <input type="datetime-local"> in the viewer's timezone. */
export function toInputValue(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromInputValue(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export const addDays = (d: Date, n: number) => {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
};
export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const startOfWeek = (d: Date) => addDays(startOfDay(d), -d.getDay());
export const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
export const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export function formatDate(iso?: string | null, withTime = false): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, withTime
    ? { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }
    : { month: "short", day: "numeric" });
}

export function timeAgo(iso?: string | null, nowMs = Date.now()): string {
  if (!iso) return "";
  const diff = Math.max(0, nowMs - new Date(iso).getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days < 31 ? `${days}d ago` : formatDate(iso);
}
