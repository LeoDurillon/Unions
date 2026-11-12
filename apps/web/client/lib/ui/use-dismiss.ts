// Closes a popup (a menu, a picker) on Escape or a click outside the element that holds it and its button.
import { useEffect, type RefObject } from 'react';

/** Calls `onClose` on Escape, or on a pointer press outside `root`, while mounted. */
export function useDismiss(root: RefObject<HTMLElement | null>, onClose: () => void): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    const onPointer = (event: PointerEvent): void => {
      if (event.target instanceof Node && root.current?.contains(event.target) !== true) {
        onClose();
      }
    };
    globalThis.addEventListener('keydown', onKey);
    globalThis.addEventListener('pointerdown', onPointer);
    return () => {
      globalThis.removeEventListener('keydown', onKey);
      globalThis.removeEventListener('pointerdown', onPointer);
    };
  }, [root, onClose]);
}
