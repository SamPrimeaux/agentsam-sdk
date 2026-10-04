import { useEffect, type RefObject } from 'react';

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * Writes --mxs-p (0 → 1) on the element as it travels through the viewport:
 *   0 = just below the fold, ~0.5 = centered, 1 = just above the top.
 * CSS turns that single number into enter / hold / exit animation, so there are
 * no React re-renders on scroll. Listeners are only attached while the element
 * is near the viewport. Reduced motion pins the element fully visible.
 */
export function useMxsScroll(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.dataset.mxsMotion = 'off';
      el.style.setProperty('--mxs-p', '0.5');
      return;
    }

    el.dataset.mxsMotion = 'on';
    let frame = 0;
    let live = false;

    const measure = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      el.style.setProperty('--mxs-p', clamp01((vh - rect.top) / (vh + rect.height)).toFixed(4));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const attach = () => {
      if (live) return;
      live = true;
      window.addEventListener('scroll', schedule, { passive: true });
      window.addEventListener('resize', schedule);
      schedule();
    };
    const detach = () => {
      if (!live) return;
      live = false;
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };

    measure();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) attach();
          else detach();
        }
      },
      { rootMargin: '20% 0px' },
    );
    observer.observe(el);

    return () => {
      observer.disconnect();
      detach();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [ref]);
}
