// The header's ⋯ menu: the actions that end a ticket, kept out of the way: Cancel ticket, then Remove ticket.

import { useCallback, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';

import type { TicketDetail } from '../../../src/api-types';
import { useTicketCommands } from '../../lib/ticket/use-ticket-commands';
import { ConfirmButton } from '../ui/confirm-button';
import { ErrorText } from '../ui/ui';
import { RemoveTicket } from './remove-ticket';

function CancelTicket({ ticketId }: { ticketId: number }): ReactElement {
  const { command } = useTicketCommands(ticketId);
  return (
    <div className="space-y-1">
      <ConfirmButton
        label="Cancel ticket"
        question="Stop it, and close its issue and open pull requests on GitHub?"
        confirmLabel="Cancel ticket"
        disabled={command.isPending}
        onConfirm={() => {
          command.mutate({ type: 'cancel' });
        }}
      />
      <ErrorText error={command.error} />
    </div>
  );
}

/** The open menu; a press outside it closes it. */
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

/** The header's ⋯ menu; nothing for a ticket that is done, which has nothing left to end. */
export function TicketMenu({
  detail,
  onRemoved,
}: {
  detail: TicketDetail;
  onRemoved: () => void;
}): ReactElement | null {
  const [open, setOpen] = useState(false);
  const close = useCallback((): void => {
    setOpen(false);
  }, []);
  const { kind } = detail.ticket.phase;
  if (kind === 'done') {
    return null;
  }
  return (
    <div className="relative">
      <button
        type="button"
        aria-label="More actions"
        aria-expanded={open}
        title="More actions"
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
      {open ? (
        <MenuPopup onClose={close}>
          {kind === 'cancelled' ? (
            <RemoveTicket ticketId={detail.ticket.id} onRemoved={onRemoved} />
          ) : (
            <CancelTicket ticketId={detail.ticket.id} />
          )}
        </MenuPopup>
      ) : null}
    </div>
  );
}
