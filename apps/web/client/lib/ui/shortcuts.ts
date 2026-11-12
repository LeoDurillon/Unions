// Single-key shortcuts: which key a keydown means, and the hook that listens. A keydown means none
// while typing, with a modifier, or under a dialog.
import { useEffect, useRef } from 'react';

/** The keys a part of the app answers, each with its action; an undefined action leaves the key alone. */
export type ShortcutMap = Record<string, (() => void) | undefined>;

type KeyEventLike = Pick<
  KeyboardEvent,
  'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'defaultPrevented' | 'repeat' | 'target'
>;

const FIELD_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/** The key was typed in a field, where it belongs to the field. */
function inField(target: EventTarget | null): boolean {
  if (typeof target !== 'object' || target === null) {
    return false;
  }
  if ('isContentEditable' in target && target.isContentEditable === true) {
    return true;
  }
  return (
    'tagName' in target && typeof target.tagName === 'string' && FIELD_TAGS.has(target.tagName)
  );
}

/** The key a keydown stands for as a shortcut, or null: typed in a field, with Ctrl, ⌘ or Alt, held down, or already taken. */
export function shortcutKey(event: KeyEventLike): string | null {
  if (event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented || event.repeat) {
    return null;
  }
  return inField(event.target) ? null : event.key;
}

/**
 * The attribute of a dialog that leaves the shortcuts on (the ticket panel, which answers its own);
 * any other open dialog (a form, a confirmation) turns them all off.
 */
const KEEPS_SHORTCUTS = 'data-shortcuts';

function underDialog(): boolean {
  return document.querySelector(`dialog[open]:not([${KEEPS_SHORTCUTS}])`) !== null;
}

/** Listens for the keys of `map` while `enabled`; the latest map is used, so its actions can change freely. */
export function useShortcuts(map: ShortcutMap, enabled = true): void {
  const latest = useRef({ map, enabled });
  useEffect(() => {
    latest.current = { map, enabled };
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const key = latest.current.enabled ? shortcutKey(event) : null;
      const action = key === null ? undefined : latest.current.map[key];
      if (action && !underDialog()) {
        event.preventDefault();
        action();
      }
    };
    globalThis.addEventListener('keydown', onKey);
    return () => {
      globalThis.removeEventListener('keydown', onKey);
    };
  }, []);
}
