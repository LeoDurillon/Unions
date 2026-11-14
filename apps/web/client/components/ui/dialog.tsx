// A modal dialog with a title and ✕, which asks before closing over unsaved text.
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from 'react';

import { Button, CloseButton } from './ui';

/** "Discard what you typed?" (or `question`) with Discard and Keep editing; Keep editing has the focus. */
export function DiscardQuestion({
  question = 'Discard what you typed?',
  onDiscard,
  onKeep,
}: {
  question?: string;
  onDiscard: () => void;
  onKeep: () => void;
}): ReactElement {
  const keep = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    keep.current?.focus();
  }, []);
  return (
    <div
      role="alertdialog"
      aria-label={question}
      className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm dark:border-amber-900 dark:bg-amber-950/40"
    >
      <span className="mr-auto">{question}</span>
      <Button variant="danger" size="sm" onClick={onDiscard}>
        Discard
      </Button>
      <Button ref={keep} size="sm" onClick={onKeep}>
        Keep editing
      </Button>
    </div>
  );
}

/** The `<dialog>` element, shown as a modal while `open`. */
function useModal(open: boolean): RefObject<HTMLDialogElement | null> {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && open && !dialog.open) {
      dialog.showModal();
    } else if (dialog && !open && dialog.open) {
      dialog.close();
    }
  }, [open]);
  return ref;
}

/**
 * A modal dialog titled `title`. While `dirty` (something typed would be lost), Escape and ✕ ask
 * before closing instead of closing.
 */
export function Dialog({
  open,
  onClose,
  title,
  wide = false,
  dirty = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** For files and long text: most of the screen's width. */
  wide?: boolean;
  /** Closing would throw away what was typed: ask first. */
  dirty?: boolean;
  children: ReactNode;
}): ReactElement {
  const ref = useModal(open);
  const titleId = useId();
  const [asking, setAsking] = useState(false);
  const requestClose = (): void => {
    if (dirty) {
      setAsking(true);
    } else {
      onClose();
    }
  };

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onClose={onClose}
      className={`m-auto w-full ${wide ? 'max-w-4xl' : 'max-w-xl'} rounded-2xl border border-zinc-200 bg-white p-0 text-zinc-900 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100`}
    >
      <div className="space-y-4 p-6">
        <header className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-lg font-semibold tracking-tight">
            {title}
          </h2>
          <CloseButton onClick={requestClose} />
        </header>
        {asking && dirty ? (
          <DiscardQuestion
            onDiscard={() => {
              setAsking(false);
              onClose();
            }}
            onKeep={() => {
              setAsking(false);
            }}
          />
        ) : null}
        {open ? children : null}
      </div>
    </dialog>
  );
}
