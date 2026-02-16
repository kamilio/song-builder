/**
 * useElapsedTimer — increments an elapsed-seconds counter every second
 * while `active` is true. Resets to 0 each time `active` transitions from
 * false → true. Clears the interval immediately when `active` becomes false.
 *
 * Used by skeleton cards (US-021) to display how long a generation has been
 * in-flight (e.g. "3s").
 */
import { useEffect, useRef, useState } from "react";

export function useElapsedTimer(active: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      startRef.current = null;
      return;
    }

    startRef.current = Date.now();

    const id = setInterval(() => {
      if (startRef.current !== null) {
        setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
      }
    }, 1000);

    return () => clearInterval(id);
  }, [active]);

  // When inactive, return 0 without holding stale state visible.
  return active ? elapsed : 0;
}
