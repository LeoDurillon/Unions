import { useSyncExternalStore } from 'react';

/** Fired after Union changes the URL itself: `pushState` does not fire `popstate`. */
export const NAVIGATED = 'union:navigate';

export function readParam(name: string): string | null {
  return new URLSearchParams(globalThis.location.search).get(name);
}

/** Sets or removes (`null`) query parameters as one history entry, and tells every reader. */
export function setParams(changes: Record<string, string | null>): void {
  const url = new URL(globalThis.location.href);
  for (const [name, value] of Object.entries(changes)) {
    if (value === null) {
      url.searchParams.delete(name);
    } else {
      url.searchParams.set(name, value);
    }
  }
  globalThis.history.pushState(null, '', url);
  globalThis.dispatchEvent(new Event(NAVIGATED));
}

function subscribe(onChange: () => void): () => void {
  globalThis.addEventListener('popstate', onChange);
  globalThis.addEventListener(NAVIGATED, onChange);
  return () => {
    globalThis.removeEventListener('popstate', onChange);
    globalThis.removeEventListener(NAVIGATED, onChange);
  };
}

/** A query parameter, kept current through back/forward and `setParams` from anywhere. */
export function useUrlParam(name: string): string | null {
  return useSyncExternalStore(subscribe, () => readParam(name));
}
