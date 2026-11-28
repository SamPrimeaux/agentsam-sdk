import { useCallback, useLayoutEffect, useRef, useState } from 'react';

export const MIN_ZOOM = 4;
export const MAX_ZOOM = 400;
export const clampZoom = (value: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(value)));
export function fitZoom(viewWidth: number, viewHeight: number, width: number, height: number) {
  return clampZoom(Math.floor(100 * Math.min(Math.max(1, viewWidth - (viewWidth < 768 ? 24 : 64)) / width, Math.max(1, viewHeight - (viewWidth < 768 ? 24 : 64)) / height, 1)));
}
export function wheelZoom(zoom: number, delta: number) {
  const next = clampZoom(zoom * Math.exp(-Math.max(-240, Math.min(240, delta)) * 0.0025));
  return delta !== 0 && next === zoom ? clampZoom(zoom + (delta < 0 ? 1 : -1)) : next;
}
export function anchoredScroll(artboardSize: number, zoom: number, coordinate: number, pointer: number, viewport: number) {
  return Math.max(0, viewport / 2 + artboardSize * zoom / 100 * coordinate - pointer);
}

/** One viewport implementation for Slides, Design and Whiteboard. Zoom is expressed in document pixels. */
export function useCanvasZoom(width: number, height: number, active: boolean, hand: boolean) {
  const areaRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(100);
  const current = useRef(100);
  const fitMode = useRef(true);
  const [view, setView] = useState({ width: 0, height: 0 });
  const pending = useRef<{ x: number; y: number; px: number; py: number; zoom: number } | null>(null);
  const center = useCallback((next: number, area: HTMLDivElement) => {
    pending.current = { x: .5, y: .5, px: area.clientWidth / 2, py: area.clientHeight / 2, zoom: next };
    current.current = next;
    setZoom(next);
  }, []);
  const fit = useCallback(() => {
    const area = areaRef.current;
    if (!area) return;
    fitMode.current = true;
    center(fitZoom(area.clientWidth, area.clientHeight, width, height), area);
    // A fit command also recenters when the zoom level has not changed.
    area.scrollLeft = width * current.current / 200;
    area.scrollTop = height * current.current / 200;
  }, [width, height, center]);

  const change = useCallback((value: number, clientX?: number, clientY?: number) => {
    const area = areaRef.current;
    if (!area) return;
    const next = clampZoom(value);
    if (next === current.current) return;
    fitMode.current = false;
    const rect = area.getBoundingClientRect();
    const px = clientX === undefined ? area.clientWidth / 2 : clientX - rect.left;
    const py = clientY === undefined ? area.clientHeight / 2 : clientY - rect.top;
    // Keep the same document coordinate beneath the pointer after scaling.
    const old = pending.current;
    const scrollX = old ? anchoredScroll(width, current.current, old.x, old.px, area.clientWidth) : area.scrollLeft;
    const scrollY = old ? anchoredScroll(height, current.current, old.y, old.py, area.clientHeight) : area.scrollTop;
    pending.current = { x: (scrollX + px - area.clientWidth / 2) / (width * current.current / 100), y: (scrollY + py - area.clientHeight / 2) / (height * current.current / 100), px, py, zoom: next };
    current.current = next;
    setZoom(next);
  }, [width, height]);

  useLayoutEffect(() => {
    const area = areaRef.current;
    if (!active || !area) return;
    const resize = () => {
      const w = area.clientWidth, h = area.clientHeight;
      setView(previous => previous.width === w && previous.height === h ? previous : { width: w, height: h });
      if (fitMode.current && w && h) center(fitZoom(w, h, width, height), area);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(area);
    return () => observer.disconnect();
  }, [active, width, height, center]);

  useLayoutEffect(() => {
    const area = areaRef.current, target = pending.current;
    if (!area || !target || target.zoom !== zoom || view.width !== area.clientWidth || view.height !== area.clientHeight) return;
    pending.current = null;
    area.scrollLeft = anchoredScroll(width, zoom, target.x, target.px, area.clientWidth);
    area.scrollTop = anchoredScroll(height, zoom, target.y, target.py, area.clientHeight);
  }, [zoom, view, width, height]);

  useLayoutEffect(() => {
    const area = areaRef.current;
    if (!active || !area) return;
    let drag: { pointer: number; x: number; y: number; left: number; top: number } | null = null;
    const wheel = (event: WheelEvent) => {
      if ((event.target as Element)?.closest('.dcx-selection-formatting-toolbar,.dcx-menu-popover,input,textarea,select')) return;
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? area.clientHeight : 1;
      if (!event.ctrlKey && !event.metaKey && (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY))) {
        area.scrollLeft += (event.deltaX || event.deltaY) * unit;
        if (!event.shiftKey) area.scrollTop += event.deltaY * unit;
      } else if (event.deltaY) change(wheelZoom(current.current, event.deltaY * unit), event.clientX, event.clientY);
    };
    const down = (event: PointerEvent) => {
      if (event.button !== 1 && !(hand && event.button === 0)) return;
      if ((event.target as Element)?.closest('button,input,textarea,select,.dcx-selection-formatting-toolbar,.dcx-menu-popover')) return;
      event.preventDefault(); event.stopPropagation();
      fitMode.current = false;
      drag = { pointer: event.pointerId, x: event.clientX, y: event.clientY, left: area.scrollLeft, top: area.scrollTop };
      area.setPointerCapture(event.pointerId);
      area.classList.add('is-panning');
    };
    const move = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointer) return;
      event.preventDefault(); event.stopPropagation();
      area.scrollLeft = drag.left - (event.clientX - drag.x);
      area.scrollTop = drag.top - (event.clientY - drag.y);
    };
    const end = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointer) return;
      drag = null; area.classList.remove('is-panning');
      if (area.hasPointerCapture(event.pointerId)) area.releasePointerCapture(event.pointerId);
    };
    const keys = (event: KeyboardEvent) => {
      if ((event.target as Element)?.closest('input,textarea,select,[contenteditable],button')) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === '+' || event.key === '=') { event.preventDefault(); change(current.current * 1.2); }
      else if (event.key === '-') { event.preventDefault(); change(current.current / 1.2); }
      else if (event.key === '0') { event.preventDefault(); fit(); }
      else if (event.key === '1') { event.preventDefault(); change(100); }
    };
    area.addEventListener('wheel', wheel, { passive: false });
    area.addEventListener('pointerdown', down, true);
    area.addEventListener('pointermove', move, true);
    area.addEventListener('pointerup', end, true);
    area.addEventListener('pointercancel', end, true);
    area.addEventListener('lostpointercapture', end);
    area.addEventListener('keydown', keys);
    return () => {
      area.removeEventListener('wheel', wheel);
      area.removeEventListener('pointerdown', down, true);
      area.removeEventListener('pointermove', move, true);
      area.removeEventListener('pointerup', end, true);
      area.removeEventListener('pointercancel', end, true);
      area.removeEventListener('lostpointercapture', end);
      area.removeEventListener('keydown', keys);
      area.classList.remove('is-panning');
    };
  }, [active, hand, change, fit]);
  return { areaRef, zoom, change, fit, worldStyle: { width: view.width + width * zoom / 100, height: view.height + height * zoom / 100, paddingLeft: view.width / 2, paddingTop: view.height / 2 }, artboardStyle: { width: width * zoom / 100, height: height * zoom / 100 } };
}
