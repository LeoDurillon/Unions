import { useCallback, useState } from 'react';

function read(key: string): number | null {
  try {
    const value = Number(globalThis.localStorage.getItem(key));
    return Number.isInteger(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

/** A number remembered in localStorage; storage being unavailable only loses the memory. */
export function useStoredNumber(key: string): [number | null, (value: number) => void] {
  const [value, setValue] = useState(() => read(key));
  const update = useCallback(
    (next: number): void => {
      setValue(next);
      try {
        globalThis.localStorage.setItem(key, String(next));
      } catch {
        // Private mode or blocked storage: keep the in-memory value.
      }
    },
    [key],
  );
  return [value, update];
}
