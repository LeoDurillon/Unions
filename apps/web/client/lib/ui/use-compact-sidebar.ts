// Whether the sidebar is folded to an icon rail, remembered in this browser. It is folded at first
// on a narrow window, or while there is only one project to switch to.
import { useCallback, useState } from 'react';

const KEY = 'union.sidebar.compact';
/** Below this window width the sidebar starts folded, until the user chooses. */
const NARROW_PX = 1100;

/** The choice the user made in this browser, if any. */
function stored(): boolean | null {
  try {
    const value = globalThis.localStorage.getItem(KEY);
    return value === null ? null : value === '1';
  } catch {
    // Storage blocked: no choice remembered.
    return null;
  }
}

/**
 * Whether the sidebar is folded to an icon rail, and folding or unfolding it. Until the user chooses, it is
 * folded on a narrow window or when `single` (one project: there is nothing to switch between).
 */
export function useCompactSidebar(single: boolean): [boolean, () => void] {
  const [choice, setChoice] = useState(stored);
  const compact = choice ?? (single || globalThis.innerWidth < NARROW_PX);
  const toggle = useCallback((): void => {
    const next = !compact;
    try {
      globalThis.localStorage.setItem(KEY, next ? '1' : '0');
    } catch {
      // Storage blocked: the choice lasts until the page closes.
    }
    setChoice(next);
  }, [compact]);
  return [compact, toggle];
}
