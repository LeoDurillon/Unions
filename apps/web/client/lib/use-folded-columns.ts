// Which board columns are folded to a narrow strip, remembered in this browser; Merged / Closed starts
// folded.
import type { BoardColumn } from '@union/core';
import { useCallback, useState } from 'react';

const KEY = 'union.board.folded';
const DEFAULT: readonly string[] = ['merged'];

function initial(): readonly string[] {
  try {
    const stored = globalThis.localStorage.getItem(KEY);
    return stored === null ? DEFAULT : stored.split(',').filter((status) => status !== '');
  } catch {
    return DEFAULT;
  }
}

/** Whether a column is folded, and folding or unfolding one. */
export function useFoldedColumns(): {
  folded: (status: BoardColumn) => boolean;
  toggle: (status: BoardColumn) => void;
} {
  const [statuses, setStatuses] = useState(initial);
  const toggle = useCallback((status: BoardColumn): void => {
    setStatuses((previous) => {
      const next = previous.includes(status)
        ? previous.filter((other) => other !== status)
        : [...previous, status];
      try {
        globalThis.localStorage.setItem(KEY, next.join(','));
      } catch {
        // Storage blocked: the choice lasts until the page closes.
      }
      return next;
    });
  }, []);
  return { folded: (status) => statuses.includes(status), toggle };
}
