// Approve, ask for a revision, or edit the output by hand (for example to answer questions).

import type { AfterApproval, Step } from '@union/core';
import { useState, type ReactElement } from 'react';

import { useTicketCommands } from '../../lib/ticket/use-ticket-commands';
import { findingsOf, parseVerdict } from '../../lib/ticket/verdict';
import { onModEnter } from '../../lib/ui/mod-enter';
import { ConfirmButton } from '../ui/confirm-button';
import { Button, ErrorText, inputClass } from '../ui/ui';
import { useApproveLabel } from './approve-label';
import { StartOver } from './start-over';

type Mode = 'idle' | 'revise' | 'edit';

function IdleButtons({
  ticketId,
  busy,
  step,
  next,
  onApprove,
  onChoose,
  onSendFindings,
  onDrop,
}: {
  ticketId: number;
  busy: boolean;
  step: Step;
  next: AfterApproval | null;
  onApprove: () => void;
  onChoose: (mode: Mode) => void;
  onSendFindings: (() => void) | null;
  /** The split plan only: forget it, back to where the split was asked. */
  onDrop: (() => void) | null;
}): ReactElement {
  const finalReview = step === 'final_review';
  const label = useApproveLabel(step, next);
  return (
    <>
      <Button variant="primary" disabled={busy} onClick={onApprove}>
        {label}
      </Button>
      {onSendFindings ? (
        <Button disabled={busy} onClick={onSendFindings}>
          Send findings to the implementer
        </Button>
      ) : null}
      <Button
        disabled={busy}
        onClick={() => {
          onChoose('revise');
        }}
      >
        {finalReview ? 'Request changes' : 'Request revision'}
      </Button>
      <Button
        disabled={busy}
        onClick={() => {
          onChoose('edit');
        }}
      >
        Edit
      </Button>
      <StartOver ticketId={ticketId} phase={{ kind: 'awaiting_approval', step }} />
      {onDrop ? (
        <ConfirmButton
          label="Drop the split"
          question="Forget this split plan?"
          confirmLabel="Drop it"
          disabled={busy}
          onConfirm={onDrop}
        />
      ) : null}
    </>
  );
}

function EditingButtons({
  mode,
  disabled,
  onSubmit,
  onCancel,
}: {
  mode: Mode;
  disabled: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}): ReactElement {
  return (
    <>
      <Button variant="primary" disabled={disabled} onClick={onSubmit}>
        {mode === 'edit' ? 'Save new version' : 'Send feedback'}
      </Button>
      <Button onClick={onCancel}>Cancel</Button>
    </>
  );
}

function DraftArea({ review }: { review: Review }): ReactElement | null {
  const { mode, text, canSubmit } = review;
  if (mode === 'idle') {
    return null;
  }
  return (
    <textarea
      className={`${inputClass} min-h-32 font-mono`}
      value={text}
      aria-label={mode === 'revise' ? 'What should change' : 'New version of the output'}
      placeholder={mode === 'revise' ? 'What should change?' : undefined}
      onChange={(event) => {
        review.handleChange(event.target.value);
      }}
      onKeyDown={onModEnter(review.handleSubmit, canSubmit)}
    />
  );
}

type Review = {
  handlePrefill: (text: string) => void;
  mode: Mode;
  text: string;
  busy: boolean;
  /** Something written, and nothing under way. */
  canSubmit: boolean;
  error: Error | null;
  handleChoose: (mode: Mode) => void;
  handleChange: (text: string) => void;
  handleSubmit: () => void;
  handleApprove: () => void;
  handleDrop: () => void;
};

type ReviewInput = {
  ticketId: number;
  step: Step;
  saved: string;
  pending: string;
  onEditing: (draft: string | null) => void;
};

function useReview({ ticketId, step, saved, pending, onEditing }: ReviewInput): Review {
  const { act, edit } = useTicketCommands(ticketId);
  const content = pending;
  const saveFirst = pending === saved ? undefined : { step, content: pending };
  const [mode, setMode] = useState<Mode>('idle');
  const [text, setText] = useState('');

  const handlePrefill = (prefill: string): void => {
    setMode('revise');
    setText(prefill);
    onEditing(null);
  };
  const handleChoose = (next: Mode): void => {
    setMode(next);
    setText(next === 'edit' ? content : '');
    onEditing(next === 'edit' ? content : null);
  };
  const handleChange = (next: string): void => {
    setText(next);
    onEditing(mode === 'edit' ? next : null);
  };
  const handleSubmit = (): void => {
    const done = {
      onSuccess: () => {
        handleChoose('idle');
      },
    };
    if (mode === 'edit') {
      edit.mutate({ step, content: text }, done);
    } else {
      act.mutate({ type: 'revise', feedback: text, saveFirst }, done);
    }
  };
  const handleApprove = (): void => {
    act.mutate({ type: 'approve', saveFirst });
  };
  const handleDrop = (): void => {
    act.mutate({ type: 'drop_split' });
  };
  const busy = act.isPending || edit.isPending;
  return {
    mode,
    text,
    busy,
    canSubmit: !busy && text.trim() !== '',
    error: act.error ?? edit.error,
    handlePrefill,
    handleChoose,
    handleChange,
    handleSubmit,
    handleApprove,
    handleDrop,
  };
}

function FinalReviewReviseHint(): ReactElement {
  return (
    <p className="text-xs text-zinc-600 dark:text-zinc-400">
      The implementation agent makes these changes, then the final review runs again.
    </p>
  );
}

/** Approve, ask for a revision, or edit the output by hand (for example to answer questions). */
export function ReviewBar({
  ticketId,
  step,
  next = null,
  content,
  pending = content,
  onEditing,
}: {
  ticketId: number;
  step: Step;
  /** What approving starts (the step and its model); null: the plain label. */
  next?: AfterApproval | null;
  /** The saved latest output. */
  content: string;
  /** The output with unsaved changes (typed answers); saved before Approve or Revise. */
  pending?: string;
  onEditing: (draft: string | null) => void;
}): ReactElement {
  const review = useReview({ ticketId, step, saved: content, pending, onEditing });
  const finalReview = step === 'final_review';
  const findings =
    finalReview && parseVerdict(content) === 'changes_requested' ? findingsOf(content) : null;
  return (
    // While idle it sticks to the bottom of the panel, so Approve stays in reach along a long output;
    // not while a draft is open, which can be as long as the output.
    <div
      className={`space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950 ${review.mode === 'idle' ? 'sticky bottom-0 z-[1] shadow-[0_-4px_12px_rgb(0_0_0/0.06)]' : ''}`}
    >
      {finalReview && review.mode === 'revise' ? <FinalReviewReviseHint /> : null}
      <DraftArea review={review} />
      <ErrorText error={review.error} />
      <div className="flex flex-wrap gap-2">
        {review.mode === 'idle' ? (
          <IdleButtons
            ticketId={ticketId}
            busy={review.busy}
            step={step}
            next={next}
            onApprove={review.handleApprove}
            onDrop={step === 'split_plan' ? review.handleDrop : null}
            onChoose={review.handleChoose}
            onSendFindings={
              findings === null
                ? null
                : () => {
                    review.handlePrefill(findings);
                  }
            }
          />
        ) : (
          <EditingButtons
            mode={review.mode}
            disabled={!review.canSubmit}
            onSubmit={review.handleSubmit}
            onCancel={() => {
              review.handleChoose('idle');
            }}
          />
        )}
      </div>
    </div>
  );
}
