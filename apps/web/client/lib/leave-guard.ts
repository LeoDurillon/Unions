// Unsaved settings: the forms holding changes, and asking before a navigation throws them away.
import { useEffect } from 'react';

import { NAVIGATED } from './url-state';

const MESSAGE = 'This page has unsaved changes. Leave it and lose them?';

/** One entry per mounted form with changes not saved yet. */
const dirty = new Set<symbol>();

/**
 * True when nothing is unsaved, or the user agrees to lose it. Agreeing forgets the changes at
 * once, so the navigation that follows does not ask a second time.
 */
export function confirmLeave(): boolean {
  if (dirty.size === 0) {
    return true;
  }
  if (!globalThis.confirm(MESSAGE)) {
    return false;
  }
  dirty.clear();
  return true;
}

/** Counts the calling form as unsaved while `isDirty`, until it unmounts. */
export function useLeaveGuard(isDirty: boolean): void {
  useEffect(() => {
    const entry = Symbol('unsaved form');
    if (isDirty) {
      dirty.add(entry);
    }
    return () => {
      dirty.delete(entry);
    };
  }, [isDirty]);
}

/** The URL the app shows, to go back to when the user refuses a back/forward that leaves. */
let shown = globalThis.location.href;

/** The settings page an URL shows, in either area: leaving it is what may lose changes. */
function settingsOf(href: string): string {
  const params = new URL(href).searchParams;
  return `${params.get('settings') ?? ''}|${params.get('union') ?? ''}`;
}

// Registered when the module loads, before any component subscribes to `popstate`: a refused
// back/forward puts the URL back before the readers see it changed.
globalThis.addEventListener('popstate', (event) => {
  const next = globalThis.location.href;
  if (settingsOf(next) !== settingsOf(shown) && !confirmLeave()) {
    event.stopImmediatePropagation();
    globalThis.history.pushState(null, '', shown);
    return;
  }
  shown = next;
});

globalThis.addEventListener(NAVIGATED, () => {
  shown = globalThis.location.href;
});

globalThis.addEventListener('beforeunload', (event) => {
  if (dirty.size > 0) {
    event.preventDefault();
  }
});
