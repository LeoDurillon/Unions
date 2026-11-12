// Help asked for from the sidebar's Help menu (the keyboard shortcuts, a project's getting-started
// checklist). It is heard by the part that shows it.
import { useEffect, useRef } from 'react';

type HelpRequest = 'shortcuts' | 'getting-started';

const EVENT = 'union:help';

/** Asks the part that shows this help to show it. */
export function requestHelp(kind: HelpRequest): void {
  globalThis.dispatchEvent(new CustomEvent(EVENT, { detail: kind }));
}

/** Calls `onRequest` each time this help is asked for, while mounted. */
export function useHelpRequest(kind: HelpRequest, onRequest: () => void): void {
  const latest = useRef(onRequest);
  useEffect(() => {
    latest.current = onRequest;
  });
  useEffect(() => {
    const listener = (event: Event): void => {
      if (event instanceof CustomEvent && event.detail === kind) {
        latest.current();
      }
    };
    globalThis.addEventListener(EVENT, listener);
    return () => {
      globalThis.removeEventListener(EVENT, listener);
    };
  }, [kind]);
}
