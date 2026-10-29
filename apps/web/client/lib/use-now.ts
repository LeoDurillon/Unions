// The current time, read again every second while `ticking`: for clocks that count while something runs.
import { useEffect, useState } from 'react';

const TICK_MS = 1000;

function noCleanup(): void {
  // Nothing ticks: nothing to clear.
}

/** `Date.now()`, updated every second while `ticking`. */
export function useNow(ticking: boolean): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!ticking) {
      return noCleanup;
    }
    const timer = setInterval(() => {
      setNow(Date.now());
    }, TICK_MS);
    return () => {
      clearInterval(timer);
    };
  }, [ticking]);
  return now;
}
