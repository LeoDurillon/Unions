// Whether the user hid a project's getting-started checklist, remembered in this browser.
import { useCallback, useState } from 'react';

const PREFIX = 'union.getting-started.hidden.';

function stored(projectId: number): boolean {
  try {
    return globalThis.localStorage.getItem(`${PREFIX}${projectId}`) === '1';
  } catch {
    return false;
  }
}

/** Whether the project's checklist is hidden, and hiding it. */
export function useGettingStartedHidden(projectId: number): [boolean, () => void] {
  const [hidden, setHidden] = useState(() => stored(projectId));
  const hide = useCallback((): void => {
    setHidden(true);
    try {
      globalThis.localStorage.setItem(`${PREFIX}${projectId}`, '1');
    } catch {
      // Storage blocked: hidden until the page closes.
    }
  }, [projectId]);
  return [hidden, hide];
}
