// One part of a setup proposal: why the agent proposes it, its values, and Apply or Dismiss until it is in the settings.
import type { ReactElement, ReactNode } from 'react';

import { Badge, Button, ErrorText } from '../ui';

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
    <div className="flex gap-2">
      {onApply ? (
        <Button size="sm" variant="primary" disabled={state.pending} onClick={onApply}>
          {state.pending ? 'Applying…' : applyLabel}
        </Button>
      ) : null}
      <Button
        size="sm"
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
      className="space-y-2 rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800"
    >
      <header className="flex items-start justify-between gap-3">
        <h3 className="font-semibold">
          {title} {state.applied ? <Badge tone="green">Applied</Badge> : null}
          {state.dismissed && !state.applied ? <Badge tone="neutral">Dismissed</Badge> : null}
        </h3>
        <Actions state={state} onApply={onApply} onDismiss={onDismiss} applyLabel={applyLabel} />
      </header>
      {state.dismissed && !state.applied ? null : (
        <>
          {why === '' ? null : <p className="text-xs text-zinc-500">{why}</p>}
          {children}
          <ErrorText error={state.error} />
        </>
      )}
    </section>
  );
}
