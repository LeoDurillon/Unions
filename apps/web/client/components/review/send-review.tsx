import { useState, type ReactElement } from 'react';

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
}: Omit<SendProps, 'canSend'> & { onCancel: () => void }): ReactElement {
  const [summary, setSummary] = useState('');
  return (
    <div className="w-[28rem] space-y-2 rounded-lg border border-zinc-300 bg-white p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
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
    </div>
  );
}

/** Sends the drafts and an optional overall note to the implementer. */
export function SendReview({ canSend, ...props }: SendProps): ReactElement {
  const [open, setOpen] = useState(false);
  if (open) {
    return (
      <SendPanel
        {...props}
        onCancel={() => {
          setOpen(false);
        }}
      />
    );
  }
  return (
    <div className="flex items-center gap-3">
      {canSend ? null : <span className="text-xs text-zinc-500">{props.copy.blocked}</span>}
      <Button
        variant="primary"
        disabled={!canSend}
        onClick={() => {
          setOpen(true);
        }}
      >
        Send review ({props.drafts})
      </Button>
    </div>
  );
}
