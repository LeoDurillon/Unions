import type { ReviewVerdict } from '@union/core';
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
  /** No verdict for a ticket's review (`copy.verdicts` false). */
  onSend: (summary: string, verdict?: ReviewVerdict) => void;
};

/** GitHub's three kinds of review, in its order; an approval needs no text. */
const VERDICT_BUTTONS: { verdict: ReviewVerdict; label: string; needsText: boolean }[] = [
  { verdict: 'comment', label: 'Comment', needsText: true },
  { verdict: 'approve', label: 'Approve', needsText: false },
  { verdict: 'request_changes', label: 'Request changes', needsText: true },
];

/** One send button for a ticket's review; Comment, Approve and Request changes for a pull request's. */
function SendButtons({
  copy,
  empty,
  pending,
  onSend,
}: {
  copy: ReviewCopy;
  /** No draft and no overall note. */
  empty: boolean;
  pending: boolean;
  onSend: (verdict?: ReviewVerdict) => void;
}): ReactElement {
  const [sent, setSent] = useState<ReviewVerdict | null>(null);
  if (!copy.verdicts) {
    return (
      <Button
        variant="primary"
        disabled={pending || empty}
        onClick={() => {
          onSend();
        }}
      >
        {pending ? 'Sending…' : copy.action}
      </Button>
    );
  }
  return (
    <>
      {VERDICT_BUTTONS.map(({ verdict, label, needsText }) => (
        <Button
          key={verdict}
          variant={verdict === 'comment' ? 'primary' : 'secondary'}
          disabled={pending || (needsText && empty)}
          onClick={() => {
            setSent(verdict);
            onSend(verdict);
          }}
        >
          {pending && sent === verdict ? 'Posting…' : label}
        </Button>
      ))}
    </>
  );
}

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
      <div className="flex flex-wrap gap-2">
        <SendButtons
          copy={copy}
          empty={drafts === 0 && summary.trim() === ''}
          pending={pending}
          onSend={(verdict) => {
            onSend(summary, verdict);
          }}
        />
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
