import { useEffect, useRef, useState, type ReactElement, type RefObject } from 'react';

import type { ReviewCopy } from '../../lib/review-target';
import { Button, ErrorText, inputClass } from '../ui';

type SendProps = {
  copy: ReviewCopy;
  drafts: number;
  /** Drafts the agent suggested that the user has not kept or edited. */
  suggestions: number;
  canSend: boolean;
  pending: boolean;
  error: Error | null;
  onSend: (summary: string) => void;
};

function SendPanel({
  copy,
  drafts,
  suggestions,
  pending,
  error,
  onSend,
  onCancel,
  anchor,
}: Omit<SendProps, 'canSend'> & {
  onCancel: () => void;
  /** The button and the panel: a click outside both closes it. */
  anchor: RefObject<HTMLElement | null>;
}): ReactElement {
  const [summary, setSummary] = useState('');
  useDismiss(anchor, onCancel);
  return (
    <section
      aria-label="Send review"
      className="absolute top-full right-0 z-30 mt-2 w-[28rem] max-w-[calc(100vw-2rem)] space-y-2 rounded-lg border border-zinc-300 bg-white p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
    >
      <p className="text-sm">
        {drafts} comment{drafts === 1 ? '' : 's'} {copy.destination}
      </p>
      {suggestions > 0 ? (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          {suggestions === 1
            ? '1 of them is an agent suggestion you have not kept or edited.'
            : `${suggestions} of them are agent suggestions you have not kept or edited.`}
        </p>
      ) : null}
      <textarea
        className={`${inputClass} min-h-20`}
        placeholder="Overall note (optional)"
        aria-label="Overall note"
        value={summary}
        onChange={(event) => {
          setSummary(event.target.value);
        }}
      />
      <ErrorText error={error} />
      <div className="flex gap-2">
        <Button
          variant="primary"
          disabled={pending || (drafts === 0 && summary.trim() === '')}
          onClick={() => {
            onSend(summary);
          }}
        >
          {pending ? 'Sending…' : copy.action}
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
      </div>
    </section>
  );
}

/** Calls `onClose` on Escape, or on a click outside `ref`'s element. */
function useDismiss(ref: RefObject<HTMLElement | null>, onClose: () => void): void {
  useEffect(() => {
    const click = (event: MouseEvent): void => {
      if (event.target instanceof Node && !ref.current?.contains(event.target)) {
        onClose();
      }
    };
    const key = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('mousedown', click);
    document.addEventListener('keydown', key);
    return (): void => {
      document.removeEventListener('mousedown', click);
      document.removeEventListener('keydown', key);
    };
  }, [ref, onClose]);
}

/** Sends the drafts and an optional overall note to the implementer, from a panel under the button. */
export function SendReview({ canSend, ...props }: SendProps): ReactElement {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const close = (): void => {
    setOpen(false);
  };
  return (
    <div ref={anchor} className="relative flex items-center gap-3">
      {canSend ? null : <span className="text-xs text-zinc-500">{props.copy.blocked}</span>}
      <Button
        variant="primary"
        disabled={!canSend}
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
        }}
      >
        Send review ({props.drafts})
      </Button>
      {open ? <SendPanel {...props} anchor={anchor} onCancel={close} /> : null}
    </div>
  );
}
