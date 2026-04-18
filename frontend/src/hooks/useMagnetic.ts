import { useEffect, useRef, type RefObject } from 'react';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function useMagnetic<T extends HTMLElement>(
  strength = { x: 0.25, y: 0.35 },
): RefObject<T | null> {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;

    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      const x = e.clientX - r.left - r.width / 2;
      const y = e.clientY - r.top - r.height / 2;
      el.style.transform = `translate(${x * strength.x}px, ${y * strength.y}px)`;
    };

    const onLeave = () => {
      el.style.transition = 'transform 0.3s ease-out';
      el.style.transform = '';
      setTimeout(() => { el.style.transition = ''; }, 300);
    };

    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    return () => {
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
    };
  }, [strength.x, strength.y]);

  return ref;
}
