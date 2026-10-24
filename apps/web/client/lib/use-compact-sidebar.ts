// Whether the sidebar is folded to an icon rail, remembered in this browser; folded at first on a
// narrow window.
import { useCallback, useState } from 'react';

const KEY = 'union.sidebar.compact';
/** Below this window width the sidebar starts folded, until the user chooses. */
const NARROW_PX = 1100;

function initial(): boolean {
  try {
    const stored = globalThis.localStorage.getItem(KEY);
    if (stored !== null) {
      return stored === '1';
    }
  } catch {
    // Storage blocked: fall back to the window's width.
  }
  return globalThis.innerWidth < NARROW_PX;
}

/** Whether the sidebar is folded to an icon rail, and folding or unfolding it. */
export function useCompactSidebar(): [boolean, () => void] {
  const [compact, setCompact] = useState(initial);
  const toggle = useCallback((): void => {
    setCompact((previous) => {
      try {
        globalThis.localStorage.setItem(KEY, previous ? '0' : '1');
      } catch {
        // Storage blocked: the choice lasts until the page closes.
      }
      return !previous;
    });
  }, []);
  return [compact, toggle];
}
