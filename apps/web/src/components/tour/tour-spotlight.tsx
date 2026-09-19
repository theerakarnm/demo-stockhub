'use client';

/**
 * The ring drawn around the element the current step points at.
 *
 * The page element is found by its data-tour-id attribute and the ring is a
 * fixed overlay positioned from getBoundingClientRect(), so the real page DOM
 * is never touched and clicks pass through everywhere except the ring line.
 * No element -> no ring and no error: pages load async and some steps are
 * panel-only.
 */

import { useEffect, useState } from 'react';

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function TourSpotlight({ targetId }: { targetId: string | null }) {
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    if (!targetId) {
      setRect(null);
      return;
    }

    const measure = () => {
      const el = document.querySelector(`[data-tour-id="${targetId}"]`);
      if (!el) {
        setRect(null);
        return;
      }
      const box = el.getBoundingClientRect();
      setRect({ top: box.top, left: box.left, width: box.width, height: box.height });
    };

    measure();
    // Pages load async and users scroll: re-measure on every layout change.
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    const poll = window.setInterval(measure, 800);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
      window.clearInterval(poll);
    };
  }, [targetId]);

  if (!rect) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed z-40 rounded-xl ring-4 ring-amber-400 ring-offset-2 transition-all duration-200 print:hidden"
      style={{
        top: rect.top - 4,
        left: rect.left - 4,
        width: rect.width + 8,
        height: rect.height + 8,
      }}
    />
  );
}
