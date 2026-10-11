"use client";

import { useEffect, useRef, useState, type ElementType, type ReactNode } from "react";

/**
 * Starts its children's entrance animations (`.reveal`, `.animate-draw`) only
 * when it scrolls into view, so below-the-fold drawings aren't finished before
 * anyone sees them. Without JS or IntersectionObserver, content simply shows.
 */
export function Reveal({ as: Tag = "div", className, children }: { as?: ElementType; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Tag ref={ref} data-inview={inView ? "true" : "false"} className={className}>
      {children}
    </Tag>
  );
}
