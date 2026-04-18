import { useEffect, useRef, type RefObject } from 'react';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function useTilt<T extends HTMLElement>(
  opts: { maxDeg?: number; perspective?: number; scale?: number } = {},
): RefObject<T | null> {
  const ref = useRef<T | null>(null);
  const { maxDeg = 8, perspective = 800, scale = 1.02 } = opts;

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;

    el.style.transformStyle = 'preserve-3d';
    el.style.willChange = 'transform';

    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      el.style.transform = `perspective(${perspective}px) rotateX(${-y * maxDeg}deg) rotateY(${x * maxDeg}deg) scale(${scale})`;
    };

    const onLeave = () => {
      el.style.transition = 'transform 0.4s ease-out';
      el.style.transform = `perspective(${perspective}px) rotateX(0) rotateY(0) scale(1)`;
      setTimeout(() => { el.style.transition = ''; }, 400);
    };

    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    return () => {
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
    };
  }, [maxDeg, perspective, scale]);

  return ref;
}
