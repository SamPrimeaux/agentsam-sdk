import { cn } from "@/lib/utils";

export function StudioMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("text-accent", className)}
      aria-hidden="true"
      fill="none"
    >
      <circle cx="16" cy="16.4" r="12.2" stroke="currentColor" strokeWidth="1.15" opacity="0.55" />
      <circle cx="16" cy="16.4" r="8.1" stroke="currentColor" strokeWidth="1.15" opacity="0.85" />
      <circle cx="16.2" cy="16.1" r="3.4" fill="currentColor" className="text-paper" />
      <path
        d="M13.2 16.1c.4-1.8 1.6-3 2.9-3"
        stroke="currentColor"
        strokeWidth="0.9"
        strokeLinecap="round"
        className="text-clay"
        opacity="0.9"
      />
    </svg>
  );
}
