"use client";

import { useRef, useEffect, useState, type ReactNode } from "react";

interface ScrollFadeInProps {
  children: ReactNode;
  className?: string;
  /** Fraction of element visible before triggering (0–1). Default 0.2 */
  threshold?: number;
}

/**
 * Lightweight scroll-triggered fade-in wrapper.
 * Fades in when entering viewport, fades out when leaving, re-triggers on every scroll.
 */
export function ScrollFadeIn({
  children,
  className = "",
  threshold = 0.2,
}: ScrollFadeInProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setVisible(entry.isIntersecting);
      },
      { threshold }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"
      } ${className}`}
    >
      {children}
    </div>
  );
}
