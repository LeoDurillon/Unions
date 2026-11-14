// The setup wizard's frame: its modal dialog, its Back/Next footer, the question before closing, and a failed setup start.

import { useEffect, useRef, type ReactElement, type ReactNode, type RefObject } from 'react';

import { Button } from '../ui/ui';

/** Opens the dialog as a modal once mounted, and closes it on unmount. */
function useModal(): RefObject<HTMLDialogElement | null> {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
    return () => {
      dialog?.close();
    };
  }, []);
  return ref;
}

/** The wizard's frame: a modal dialog (focus kept inside, the page behind inert); Escape asks `onClose`. */
export function WizardDialog({
  onClose,
  children,
}: {
  onClose: () => void;
  children: ReactNode;
}): ReactElement {
  const dialog = useModal();
  return (
    <dialog
      ref={dialog}
      aria-labelledby="wizard-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="m-0 h-full max-h-none w-full max-w-none bg-transparent p-0 text-zinc-900 dark:text-zinc-100"
    >
      <div className="flex min-h-full flex-col items-center px-4 pt-16 pb-8">{children}</div>
    </dialog>
  );
}

/** Back and Next (Create project on the last step); both wait while the project is being created. */
export function Footer({
  last,
  canBack,
  canNext,
  pending,
  onPrev,
  onNext,
}: {
  last: boolean;
  canBack: boolean;
  canNext: boolean;
  pending: boolean;
  onPrev: () => void;
  onNext: () => void;
}): ReactElement {
  const label = last ? 'Create project' : 'Next';
  return (
    // A bar along the card's bottom edge, as the other dialogs have it.
    <footer className="flex items-center justify-between rounded-b-2xl border-t border-zinc-200 bg-zinc-50 px-6 py-3 dark:border-zinc-800 dark:bg-zinc-950">
      {canBack ? (
        <Button disabled={pending} onClick={onPrev}>
          Back
        </Button>
      ) : (
        <span />
      )}
      <Button variant="primary" disabled={!canNext || pending} onClick={onNext}>
        {pending ? 'Creating…' : label}
      </Button>
    </footer>
  );
}

/** The project was created but its setup agent did not start: why, where to run it again, and on to the project. */
export function SetupNotStarted({
  reason,
  onOpen,
}: {
  reason: string;
  onOpen: () => void;
}): ReactElement {
  const open = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    open.current?.focus();
  }, []);
  return (
    <div role="alert" className="space-y-3 text-sm">
      <p>
        The project is created, but the setup agent could not start: <span>{reason}</span>
      </p>
      <p className="text-zinc-500">
        You can run it again from <strong>Settings → General → Setup agent → Run setup</strong>.
      </p>
      <Button ref={open} variant="primary" onClick={onOpen}>
        Open the project
      </Button>
    </div>
  );
}
