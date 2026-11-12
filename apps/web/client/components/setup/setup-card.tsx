// One part of a setup proposal: why the agent proposes it, its values, and Apply or Dismiss until it is in the settings.

import type { ReactElement, ReactNode } from 'react';

import { Badge, Button, ErrorText } from '../ui/ui';

export type CardState = {
  /** The settings already hold it. */
  applied: boolean;
  dismissed: boolean;
  pending: boolean;
  error: Error | null;
};

function Actions({
  state,
  onApply,
  onDismiss,
  applyLabel,
}: {
  state: CardState;
  onApply?: () => void;
  onDismiss: (dismissed: boolean) => void;
  applyLabel: string;
}): ReactElement | null {
  if (state.applied) {
    return null;
  }
  if (state.dismissed) {
    return (
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          onDismiss(false);
        }}
      >
        Show
      </Button>
    );
  }
  return (
    <div className="flex shrink-0 gap-2">
      {onApply ? (
        <Button variant="primary" disabled={state.pending} onClick={onApply}>
          {state.pending ? 'Applying…' : applyLabel}
        </Button>
      ) : null}
      <Button
        variant="ghost"
        onClick={() => {
          onDismiss(true);
        }}
      >
        Dismiss
      </Button>
    </div>
  );
}

export function SetupCard({
  title,
  why,
  state,
  onApply,
  onDismiss,
  applyLabel = 'Apply',
  children,
}: {
  title: string;
  why: string;
  state: CardState;
  /** Absent: the card is a to-do the user does in its own fields. */
  onApply?: () => void;
  onDismiss: (dismissed: boolean) => void;
  applyLabel?: string;
  children: ReactNode;
}): ReactElement {
  return (
    <section
      aria-label={title}
      className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 text-sm shadow-xs dark:border-zinc-800 dark:bg-zinc-900"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <h3 className="flex flex-wrap items-center gap-2 text-[15px] font-semibold">
            {title} {state.applied ? <Badge tone="green">Applied</Badge> : null}
            {state.dismissed && !state.applied ? <Badge tone="neutral">Dismissed</Badge> : null}
          </h3>
          {why === '' || (state.dismissed && !state.applied) ? null : (
            <p className="text-sm text-zinc-500">{why}</p>
          )}
        </div>
        <Actions state={state} onApply={onApply} onDismiss={onDismiss} applyLabel={applyLabel} />
      </header>
      {state.dismissed && !state.applied ? null : (
        <>
          {children}
          <ErrorText error={state.error} />
        </>
      )}
    </section>
  );
}
