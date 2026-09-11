import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { useWorkStore } from "@/lib/work/store";

function drawFloor(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  reduced: boolean,
) {
  ctx.clearRect(0, 0, width, height);
  const bg =
    typeof getComputedStyle !== "undefined"
      ? getComputedStyle(document.documentElement).getPropertyValue("--color-bg").trim() || "#070708"
      : "#070708";
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  const vpX = width * 0.5;
  const vpY = height * 0.4;
  const tick = reduced ? 0 : time;

  const rays = 42;
  for (let i = 0; i <= rays; i += 1) {
    const t = i / rays;
    const x = width * (-0.22 + t * 1.44);
    const y = height * 1.12;
    const dist = Math.abs(t - 0.5) * 2;
    const hue =
      t < 0.5 ? 275 + t * 2 * (38 - 275) : 38 + (t - 0.5) * 2 * (188 - 38);
    const pulse = reduced ? 0 : 0.1 * Math.sin(tick * 1.6 + t * 10);
    const alpha = 0.16 + 0.42 * (1 - dist) + pulse;
    ctx.strokeStyle = `hsla(${hue}, 58%, 68%, ${Math.max(0.08, alpha)})`;
    ctx.lineWidth = dist < 0.18 ? 1.4 : 0.9;
    ctx.beginPath();
    ctx.moveTo(vpX, vpY);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  const rows = 20;
  for (let i = 1; i <= rows; i += 1) {
    const p = i / (rows + 1);
    const y = vpY + (height - vpY) * Math.pow(p, 1.55);
    const scale = (y - vpY) / Math.max(1, height - vpY);
    const half = width * 0.82 * scale;
    const alpha = 0.1 + 0.28 * (1 - p);
    ctx.strokeStyle = `hsla(38, 28%, 76%, ${alpha})`;
    ctx.lineWidth = 0.85;
    ctx.beginPath();
    ctx.moveTo(vpX - half, y);
    ctx.lineTo(vpX + half, y);
    ctx.stroke();
  }

  const fade = ctx.createLinearGradient(0, 0, 0, height * 0.48);
  fade.addColorStop(0, "rgba(7, 7, 8, 0.92)");
  fade.addColorStop(0.5, "rgba(7, 7, 8, 0.28)");
  fade.addColorStop(1, "rgba(7, 7, 8, 0)");
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, width, height * 0.48);
}

export function AgentLoader({ className }: { className?: string }) {
  const busy = useWorkStore((s) => s.agentBusy);
  const status = useWorkStore((s) => s.agentStatus);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!busy) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let frame = 0;
    let running = true;
    const started = performance.now();

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    const observer = new ResizeObserver(resize);
    if (canvas.parentElement) observer.observe(canvas.parentElement);

    const loop = (now: number) => {
      if (!running) return;
      const t = (now - started) / 1000;
      const parent = canvas.parentElement;
      const w = parent?.clientWidth ?? 1;
      const h = parent?.clientHeight ?? 1;
      drawFloor(ctx, w, h, t, reduced);
      if (!reduced) frame = requestAnimationFrame(loop);
    };

    if (reduced) {
      const parent = canvas.parentElement;
      drawFloor(ctx, parent?.clientWidth ?? 1, parent?.clientHeight ?? 1, 0, true);
    } else {
      frame = requestAnimationFrame(loop);
    }

    return () => {
      running = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [busy]);

  if (!busy) return null;

  return (
    <div
      className={cn(
        "absolute inset-0 z-20 overflow-hidden bg-bg",
        className,
      )}
      aria-live="polite"
      aria-busy="true"
      data-agent-loader="true"
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <div className="relative flex h-full flex-col items-center justify-center px-6 text-center">
        <p className="agent-status font-sans text-sm tracking-tight">{status || "Working"}</p>
      </div>
    </div>
  );
}
