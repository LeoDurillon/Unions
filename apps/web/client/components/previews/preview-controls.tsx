// The preview's buttons: Start (Cancel while it starts; Restart, data kept, and Stop while it runs).
// Its addresses are on its services' rows.

import type { ReactElement } from 'react';

import type { PreviewView } from '../../../src/api-types';
import type { PreviewCalls } from '../../lib/preview/use-preview';
import { Button } from '../ui/ui';
import { failedWithReason } from './preview-failure';

export type Act = (call: () => Promise<PreviewView>) => void;

/** While it starts: Cancel, which stops the start; not while the e2e tests started it. */
function CancelStart({
  view,
  calls,
  act,
  busy,
}: {
  view: PreviewView;
  calls: PreviewCalls;
  act: Act;
  busy: boolean;
}): ReactElement {
  const stopping = view.preview?.status === 'stopping' || view.pending;
  const testing = view.preview?.e2eStatus === 'running';
  return (
    <Button
      disabled={busy || stopping || testing}
      title={
        testing
          ? 'The end-to-end tests started it: wait for them to end'
          : 'Stops the start and takes down what it brought up'
      }
      onClick={() => {
        act(calls.stop);
      }}
    >
      {stopping ? 'Stopping…' : 'Cancel start'}
    </Button>
  );
}

/** The one button a preview not running gets: Start, or Cancel while it starts. */
function StartOrCancel({
  view,
  calls,
  act,
  busy,
}: {
  view: PreviewView;
  calls: PreviewCalls;
  act: Act;
  busy: boolean;
}): ReactElement {
  const status = view.preview?.status;
  if (status === 'starting' || status === 'stopping') {
    return <CancelStart view={view} calls={calls} act={act} busy={busy} />;
  }
  return (
    <Button
      variant="primary"
      disabled={busy || view.refusal !== null}
      title={view.refusal ?? undefined}
      onClick={() => {
        act(calls.start);
      }}
    >
      Start preview
    </Button>
  );
}

/** A running preview's buttons: Restart (its data kept) and Stop. */
function RunningButtons({
  calls,
  act,
  busy,
  refusal,
}: {
  calls: PreviewCalls;
  act: Act;
  busy: boolean;
  refusal: string | null;
}): ReactElement {
  return (
    <>
      <Button
        disabled={busy || refusal !== null}
        title={refusal ?? 'Updates the running preview; its data is kept'}
        onClick={() => {
          act(calls.start);
        }}
      >
        Restart
      </Button>
      <Button
        disabled={busy}
        onClick={() => {
          act(calls.stop);
        }}
      >
        Stop
      </Button>
    </>
  );
}

/** The buttons the preview's state calls for; none after a failed start, whose card has Start again. */
export function Controls({
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
  if (failedWithReason(view)) {
    return null;
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {view.preview?.status === 'running' ? (
        <RunningButtons calls={calls} act={act} busy={busy} refusal={view.refusal} />
      ) : (
        <StartOrCancel view={view} calls={calls} act={act} busy={busy} />
      )}
    </div>
  );
}
