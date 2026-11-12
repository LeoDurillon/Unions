// A ⋯ button that opens a small menu under it, for the actions a header keeps out of the way. A press outside
// the menu closes it.

import { useCallback, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';

/** The open menu; a press outside it and its button closes it. */
function MenuPopup({
  onClose,
  children,
}: {
  onClose: () => void;
  children: ReactNode;
}): ReactElement {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onPointer = (event: PointerEvent): void => {
      const toggle = box.current?.parentElement;
      if (event.target instanceof Node && !toggle?.contains(event.target)) {
        onClose();
      }
    };
    globalThis.addEventListener('pointerdown', onPointer);
    return () => {
      globalThis.removeEventListener('pointerdown', onPointer);
    };
  }, [onClose]);
  return (
    <div
      ref={box}
      className="absolute top-full right-0 z-20 mt-2 w-80 rounded-xl border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
    >
      {children}
    </div>
  );
}

/** `label` names the button for screen readers and on hover. */
export function MoreMenu({
  label = 'More actions',
  children,
}: {
  label?: string;
  children: ReactNode;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const close = useCallback((): void => {
    setOpen(false);
  }, []);
  return (
    <div className="relative">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        title={label}
        className="flex size-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
        onClick={() => {
          setOpen(!open);
        }}
      >
        <svg aria-hidden viewBox="0 0 24 24" fill="currentColor" className="size-4">
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>
      {open ? <MenuPopup onClose={close}>{children}</MenuPopup> : null}
    </div>
  );
}
