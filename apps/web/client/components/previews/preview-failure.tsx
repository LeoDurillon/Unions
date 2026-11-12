// Why the preview failed to start, above its card, with Start again beside the reason.

import type { ReactElement } from 'react';

import type { PreviewView } from '../../../src/api-types';
import type { PreviewCalls } from '../../lib/preview/use-preview';
import { Button } from '../ui/ui';
import type { Act } from './preview-controls';

/** A start that failed with a reason; Start again is the one button it needs. */
export function failedWithReason(view: PreviewView): boolean {
  return view.preview?.status === 'failed' && Boolean(view.preview.error);
}

export function PreviewFailure({
  view,
  calls,
  act,
  busy,
}: {
  view: PreviewView;
  calls: PreviewCalls;
  act: Act;
  busy: boolean;
}): ReactElement | null {
  if (!failedWithReason(view)) {
    return null;
  }
  return (
    <section className="flex items-start gap-3.5 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/40">
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-red-200 bg-white font-bold text-red-700 dark:border-red-900 dark:bg-zinc-900 dark:text-red-400"
      >
        !
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <h3 className="text-[15px] font-semibold">The preview failed</h3>
        <pre className="font-mono text-xs whitespace-pre-wrap text-red-700 dark:text-red-400">
          {view.preview?.error}
        </pre>
      </div>
      <Button
        variant="primary"
        disabled={busy || view.refusal !== null}
        title={view.refusal ?? undefined}
        onClick={() => {
          act(calls.start);
        }}
      >
        Start again
      </Button>
    </section>
  );
}
