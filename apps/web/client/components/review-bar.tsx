// Approve, ask for a revision, or edit the output by hand (for example to answer questions).
import type { Step } from '@union/core';
import { useState, type ReactElement } from 'react';

import { useTicketCommands } from '../lib/use-ticket-commands';
import { findingsOf, parseVerdict } from '../lib/verdict';
import { Button, ErrorText, inputClass } from './ui';

type Mode = 'idle' | 'revise' | 'edit';

function approveLabel(step: Step): string {
  if (step === 'final_review') {
    return 'Approve and mark PR ready';
  }
  return step === 'split_plan' ? 'Approve and split' : 'Approve';
}

function IdleButtons({
  busy,
  step,
  onApprove,
  onChoose,
  onSendFindings,
  onDrop,
}: {
  busy: boolean;
  step: Step;
  onApprove: () => void;
  onChoose: (mode: Mode) => void;
  onSendFindings: (() => void) | null;
  /** The split plan only: forget it, back to where the split was asked. */
  onDrop: (() => void) | null;
}): ReactElement {
  const finalReview = step === 'final_review';
  return (
    <>
      <Button variant="primary" disabled={busy} onClick={onApprove}>
        {approveLabel(step)}
      </Button>
      {onSendFindings ? (
        <Button onClick={onSendFindings}>Send findings to the implementer</Button>
      ) : null}
      <Button
        onClick={() => {
          onChoose('revise');
        }}
      >
        {finalReview ? 'Request changes' : 'Request revision'}
      </Button>
      <Button
        onClick={() => {
          onChoose('edit');
        }}
      >
        Edit
      </Button>
      {onDrop ? (
        <Button disabled={busy} onClick={onDrop}>
          Drop the split
        </Button>
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

function DraftArea({
  mode,
  text,
  onChange,
}: {
  mode: Mode;
  text: string;
  onChange: (text: string) => void;
}): ReactElement | null {
  if (mode === 'idle') {
    return null;
  }
  return (
    <textarea
      className={`${inputClass} min-h-32 font-mono`}
      value={text}
      placeholder={mode === 'revise' ? 'What should change?' : undefined}
      onChange={(event) => {
        onChange(event.target.value);
      }}
    />
  );
}

type Review = {
  handlePrefill: (text: string) => void;
  mode: Mode;
  text: string;
  busy: boolean;
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
    error: act.error ?? edit.error,
    handlePrefill,
    handleChoose,
    handleChange,
    handleSubmit,
    handleApprove,
    handleDrop,
  };
}

/** Approve, ask for a revision, or edit the output by hand (for example to answer questions). */
export function ReviewBar({
  ticketId,
  step,
  content,
  pending = content,
  onEditing,
}: {
  ticketId: number;
  step: Step;
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
    <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
      {finalReview && review.mode === 'revise' ? (
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          The implementation agent makes these changes, then the final review runs again.
        </p>
      ) : null}
      <DraftArea mode={review.mode} text={review.text} onChange={review.handleChange} />
      <ErrorText error={review.error} />
      <div className="flex flex-wrap gap-2">
        {review.mode === 'idle' ? (
          <IdleButtons
            busy={review.busy}
            step={step}
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
            disabled={review.busy || review.text.trim() === ''}
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
