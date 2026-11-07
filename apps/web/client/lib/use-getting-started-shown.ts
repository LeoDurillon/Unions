// Whether a project's getting-started checklist shows: hidden by the user (remembered in this browser), shown
// by itself while a step is left, or asked for again from the Help menu (shown even when complete).
import { useCallback, useState } from 'react';

import { requestHelp, useHelpRequest } from './help-requests';

const PREFIX = 'union.getting-started.hidden.';

type Shown = 'hidden' | 'auto' | 'asked';

/** Projects whose checklist was asked for in this page: it shows when their board opens. */
const asked = new Set<number>();

function remember(projectId: number, hidden: boolean): void {
  try {
    if (hidden) {
      globalThis.localStorage.setItem(`${PREFIX}${projectId}`, '1');
    } else {
      globalThis.localStorage.removeItem(`${PREFIX}${projectId}`);
    }
  } catch {
    // Storage blocked: the choice lasts until the page closes.
  }
}

function initial(projectId: number): Shown {
  if (asked.has(projectId)) {
    return 'asked';
  }
  try {
    return globalThis.localStorage.getItem(`${PREFIX}${projectId}`) === '1' ? 'hidden' : 'auto';
  } catch {
    return 'auto';
  }
}

/** Shows the project's checklist again, complete or not, and the board it sits on. */
export function askGettingStarted(projectId: number): void {
  asked.add(projectId);
  remember(projectId, false);
  requestHelp('getting-started');
}

/** How the project's checklist shows, and hiding it. */
export function useGettingStartedShown(projectId: number): [Shown, () => void] {
  const [shown, setShown] = useState(() => initial(projectId));
  useHelpRequest('getting-started', () => {
    setShown(initial(projectId));
  });
  const hide = useCallback((): void => {
    asked.delete(projectId);
    setShown('hidden');
    remember(projectId, true);
  }, [projectId]);
  return [shown, hide];
}
