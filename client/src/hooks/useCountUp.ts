import { useEffect, useRef, useState } from "react";

/** Animates numeric KPI values counting up/down to `target` whenever it changes. Pass `null` to skip animation. */
export function useCountUp(target: number | null, durationMs = 700): number {
  const [value, setValue] = useState(target ?? 0);
  const fromRef = useRef(target ?? 0);

  useEffect(() => {
    if (target === null || target === fromRef.current) return;
    const from = fromRef.current;
    const start = performance.now();
    let raf = 0;

    function tick(now: number) {
      const progress = Math.min((now - start) / durationMs, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(from + (target! - from) * eased));
      if (progress < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        fromRef.current = target!;
      }
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return value;
}
