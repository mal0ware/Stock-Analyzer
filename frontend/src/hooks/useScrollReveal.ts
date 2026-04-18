import { useEffect, useRef, type RefObject } from 'react';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function useScrollReveal<T extends HTMLElement>(
  opts: { threshold?: number; rootMargin?: string } = {},
): RefObject<T | null> {
  const ref = useRef<T | null>(null);
  const { threshold = 0.12, rootMargin = '0px 0px -60px 0px' } = opts;

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) {
      // If reduced motion, make visible immediately
      if (el) el.classList.add('revealed');
      return;
    }

    el.classList.add('reveal-target');

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
            io.unobserve(entry.target);
          }
        }
      },
      { threshold, rootMargin },
    );

    io.observe(el);
    return () => io.disconnect();
  }, [threshold, rootMargin]);

  return ref;
}
