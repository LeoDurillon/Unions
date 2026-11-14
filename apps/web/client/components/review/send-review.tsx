// Sends the drafts and an optional overall note to the implementer, from a panel under the button.

import type { ReviewVerdict } from '@union/core';
import { useEffect, useRef, useState, type ReactElement, type RefObject } from 'react';

import type { ReviewCopy } from '../../lib/review/review-target';
import { onModEnter } from '../../lib/ui/mod-enter';
import { plural } from '../../lib/ui/plural';
import { Button, ErrorText, inputClass } from '../ui/ui';

type SendProps = {
  copy: ReviewCopy;
  drafts: number;
  /** Drafts the agent suggested that the user has not kept or edited. */
  suggestions: number;
  canSend: boolean;
  pending: boolean;
  error: Error | null;
  /** Keeping every agent suggestion is under way. */
  keeping: boolean;
  /** Keeps every agent suggestion as the user's, so another agent run does not replace them. */
  onKeepAll: () => void;
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

/** The agent suggestions not kept yet, and the button that keeps them all. */
function Suggestions({
  count,
  keeping,
  onKeepAll,
}: {
  count: number;
  keeping: boolean;
  onKeepAll: () => void;
}): ReactElement {
  return (
    <div className="flex items-start justify-between gap-3">
      <p className="text-sm text-amber-700 dark:text-amber-400">
        {count === 1
          ? '1 of them is an agent suggestion you have not kept or edited.'
          : `${count} of them are agent suggestions you have not kept or edited.`}
      </p>
      <Button disabled={keeping} onClick={onKeepAll}>
        {keeping ? 'Keeping…' : `Keep all (${count})`}
      </Button>
    </div>
  );
}

function SendPanel({
  copy,
  drafts,
  suggestions,
  pending,
  error,
  keeping,
  onKeepAll,
  onSend,
  onCancel,
  anchor,
  summary,
  onSummary,
}: Omit<SendProps, 'canSend'> & {
  onCancel: () => void;
  /** The button and the panel: a click outside both closes it. */
  anchor: RefObject<HTMLElement | null>;
  /** The overall note, kept by the caller so closing the panel does not lose it. */
  summary: string;
  onSummary: (summary: string) => void;
}): ReactElement {
  useDismiss(anchor, onCancel);
  const empty = drafts === 0 && summary.trim() === '';
  // Ctrl/⌘+Enter sends as the first button does: the one send button, or Comment.
  const sendFirst = (): void => {
    onSend(summary, copy.verdicts ? 'comment' : undefined);
  };
  return (
    <section
      aria-label="Send review"
      className="absolute top-full right-0 z-30 mt-2 w-[28rem] max-w-[calc(100vw-2rem)] space-y-2 rounded-lg border border-zinc-300 bg-white p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
    >
      <p className="text-sm">
        {plural(drafts, 'comment')} {copy.destination}
      </p>
      {suggestions > 0 ? (
        <Suggestions count={suggestions} keeping={keeping} onKeepAll={onKeepAll} />
      ) : null}
      <textarea
        className={`${inputClass} min-h-20`}
        placeholder="Overall note (optional)"
        aria-label="Overall note"
        value={summary}
        onChange={(event) => {
          onSummary(event.target.value);
        }}
        onKeyDown={onModEnter(sendFirst, !pending && !empty)}
      />
      <ErrorText error={error} />
      <div className="flex flex-wrap gap-2">
        <SendButtons
          copy={copy}
          empty={empty}
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

/** Whether a key press comes from a text field, where Escape should not close the panel. */
function inField(target: EventTarget | null): boolean {
  return target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement;
}

/** Calls `onClose` on Escape outside a text field, or on a click outside `ref`'s element. */
function useDismiss(ref: RefObject<HTMLElement | null>, onClose: () => void): void {
  useEffect(() => {
    const click = (event: MouseEvent): void => {
      if (event.target instanceof Node && !ref.current?.contains(event.target)) {
        onClose();
      }
    };
    const key = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !inField(event.target)) {
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

/** Empties the overall note once a send finished without an error: it went with the review. */
function useClearOnSent(
  pending: boolean,
  error: Error | null,
  setSummary: (summary: string) => void,
): void {
  const wasPending = useRef(pending);
  useEffect(() => {
    if (wasPending.current && !pending && error === null) {
      setSummary('');
    }
    wasPending.current = pending;
  }, [pending, error, setSummary]);
}

/** Sends the drafts and an optional overall note to the implementer, from a panel under the button. */
export function SendReview({ canSend, ...props }: SendProps): ReactElement {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState('');
  useClearOnSent(props.pending, props.error, setSummary);
  const anchor = useRef<HTMLDivElement>(null);
  const close = (): void => {
    setOpen(false);
  };
  return (
    <div ref={anchor} className="relative flex items-center gap-3">
      {/* Why it cannot be sent, on hover over the button and for screen readers: written out, it took
          the room of the title. */}
      {canSend ? null : <span className="sr-only">{props.copy.blocked}</span>}
      <span title={canSend ? undefined : props.copy.blocked}>
        <Button
          variant={props.drafts > 0 ? 'primary' : 'secondary'}
          disabled={!canSend}
          aria-expanded={open}
          onClick={() => {
            setOpen(!open);
          }}
        >
          Send review ({props.drafts})
        </Button>
      </span>
      {open ? (
        <SendPanel
          {...props}
          anchor={anchor}
          onCancel={close}
          summary={summary}
          onSummary={setSummary}
        />
      ) : null}
    </div>
  );
}
