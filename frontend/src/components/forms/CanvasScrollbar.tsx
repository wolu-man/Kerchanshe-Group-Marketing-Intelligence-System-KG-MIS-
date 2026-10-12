'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Custom horizontal scrollbar for the canvas frame
// ---------------------------------------------------------------------------
export function CanvasScrollbar({ scrollRef }: { scrollRef: React.RefObject<HTMLDivElement> }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [thumbLeft, setThumbLeft] = useState(0);
  const [thumbWidth, setThumbWidth] = useState(0);
  const dragging = useRef<{ startX: number; startScroll: number } | null>(null);

  // Recalculate thumb geometry from the scroll container
  const update = useCallback(() => {
    const el = scrollRef.current;
    const track = trackRef.current;
    if (!el || !track) return;
    const trackW = track.clientWidth;
    const scrollW = el.scrollWidth;
    const clientW = el.clientWidth;
    if (scrollW <= clientW) { setThumbWidth(0); setThumbLeft(0); return; }
    const ratio = clientW / scrollW;
    const tw = Math.max(40, trackW * ratio);
    const maxScroll = scrollW - clientW;
    const pos = (el.scrollLeft / maxScroll) * (trackW - tw);
    setThumbWidth(tw);
    setThumbLeft(pos);
  }, [scrollRef]);

  // Listen to scroll events on the frame wrapper
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', update); ro.disconnect(); };
  }, [scrollRef, update]);

  // Keep thumb in sync when scroll container resizes (e.g. panel toggle, zoom)
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const ro = new ResizeObserver(update);
    ro.observe(track);
    return () => ro.disconnect();
  }, [update]);

  // ---- Pointer drag on thumb ----
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragging.current = { startX: e.clientX, startScroll: scrollRef.current?.scrollLeft ?? 0 };
  }, [scrollRef]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current || !trackRef.current || !scrollRef.current) return;
    const trackW = trackRef.current.clientWidth;
    const scrollW = scrollRef.current.scrollWidth;
    const clientW = scrollRef.current.clientWidth;
    if (scrollW <= clientW) return;
    const dx = e.clientX - dragging.current.startX;
    const scrollRange = scrollW - clientW;
    const thumbRange = trackW - thumbWidth;
    if (thumbRange <= 0) return;
    const scrollDelta = (dx / thumbRange) * scrollRange;
    scrollRef.current.scrollLeft = dragging.current.startScroll + scrollDelta;
  }, [scrollRef, thumbWidth]);

  const onPointerUp = useCallback(() => { dragging.current = null; }, []);

  // ---- Click on track to page scroll ----
  const onTrackClick = useCallback((e: React.MouseEvent) => {
    const track = trackRef.current;
    const el = scrollRef.current;
    if (!track || !el) return;
    // Ignore if click was on the thumb itself
    if ((e.target as HTMLElement).dataset.thumb) return;
    const trackRect = track.getBoundingClientRect();
    const clickX = e.clientX - trackRect.left;
    const trackW = track.clientWidth;
    const scrollW = el.scrollWidth;
    const clientW = el.clientWidth;
    if (scrollW <= clientW) return;
    const maxScroll = scrollW - clientW;
    const scrollTarget = (clickX / trackW) * maxScroll;
    el.scrollTo({ left: scrollTarget, behavior: 'smooth' });
  }, [scrollRef]);

  if (thumbWidth <= 0) return null;

  return (
    <div className="bcv-scrollbar" ref={trackRef} onPointerDown={onTrackClick}>
      <div
        className="bcv-scrollbar-thumb"
        data-thumb="1"
        style={{ left: thumbLeft, width: thumbWidth }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />
    </div>
  );
}
