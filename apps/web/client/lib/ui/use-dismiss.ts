// Closes a popup (a menu, a picker) on Escape or a click outside the element that holds it and its button.
import { useEffect, type RefObject } from 'react';

/**
 * Calls `onClose` on Escape, or on a pointer press outside `root`, while mounted. Escape is taken
 * before anything else hears it (capture, then `preventDefault`), so it closes the popup only, not
 * the panel or dialog the popup sits in.
 */
export function useDismiss(root: RefObject<HTMLElement | null>, onClose: () => void): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    const onPointer = (event: PointerEvent): void => {
      if (event.target instanceof Node && root.current?.contains(event.target) !== true) {
        onClose();
      }
    };
    globalThis.addEventListener('keydown', onKey, true);
    globalThis.addEventListener('pointerdown', onPointer);
    return () => {
      globalThis.removeEventListener('keydown', onKey, true);
      globalThis.removeEventListener('pointerdown', onPointer);
    };
  }, [root, onClose]);
}
