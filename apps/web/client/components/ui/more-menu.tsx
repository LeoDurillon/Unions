// A ⋯ button that opens a small menu under it, for the actions a header keeps out of the way. Escape or a
// press outside the menu closes it.

import {
  useCallback,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from 'react';

import { useDismiss } from '../../lib/ui/use-dismiss';
import { FOCUS_RING } from './focus';

/** The open menu: as wide as its widest item, within bounds. */
function MenuPopup({ children }: { children: ReactNode }): ReactElement {
  return (
    <div
      role="menu"
      className="absolute top-full right-0 z-20 mt-2 w-max max-w-80 min-w-44 rounded-xl border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
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
  const root = useRef<HTMLDivElement>(null);
  const close = useCallback((): void => {
    setOpen(false);
  }, []);
  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        title={label}
        className={`flex size-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 ${FOCUS_RING}`}
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
      {open ? (
        <OpenMenu root={root} onClose={close}>
          {children}
        </OpenMenu>
      ) : null}
    </div>
  );
}

/** Mounted while open, so Escape and outside presses are heard only then. */
function OpenMenu({
  root,
  onClose,
  children,
}: {
  root: RefObject<HTMLDivElement | null>;
  onClose: () => void;
  children: ReactNode;
}): ReactElement {
  useDismiss(root, onClose);
  return <MenuPopup>{children}</MenuPopup>;
}
