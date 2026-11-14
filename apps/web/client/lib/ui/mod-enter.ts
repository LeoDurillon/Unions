// Ctrl+Enter (⌘+Enter on a Mac) in a text box: the key that sends what was written.
import type { KeyboardEvent } from 'react';

/** A keydown handler that runs `action` on Ctrl/⌘+Enter, unless `enabled` is false (nothing to send, or sending). */
export function onModEnter(
  action: () => void,
  enabled = true,
): (event: KeyboardEvent<HTMLElement>) => void {
  return (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      if (enabled) {
        action();
      }
    }
  };
}
