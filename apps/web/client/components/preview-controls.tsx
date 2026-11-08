// The preview's addresses and buttons: Start (Cancel while it starts; Restart, data kept, and Stop
// while it runs).

import type { Preview } from '@union/core';
import type { ReactElement } from 'react';

import type { PreviewView } from '../../src/api-types';
import type { PreviewCalls } from '../lib/preview/use-preview';
import { Button } from './ui';

export type Act = (call: () => Promise<PreviewView>) => void;

/** Every exposed service's address; previews from before several services were possible have one. */
function OpenLinks({ preview }: { preview: Preview | null }): ReactElement | null {
  if (preview?.status !== 'running') {
    return null;
  }
  const urls = preview.urls ?? (preview.url ? [{ service: '', url: preview.url }] : []);
  return (
    <ul className="space-y-1 text-sm">
      {urls.map(({ service, url }) => (
        <li key={url} className="flex items-baseline gap-2">
          {service === '' ? null : (
            <span className="w-24 shrink-0 truncate text-zinc-500">{service}</span>
          )}
          <a
            className="min-w-0 truncate text-indigo-600 hover:underline dark:text-indigo-400"
            href={url}
            target="_blank"
            rel="noreferrer"
          >
            {url} ↗
          </a>
        </li>
      ))}
    </ul>
  );
}

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

/** The preview's addresses and the buttons its state calls for. */
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
}): ReactElement {
  const running = view.preview?.status === 'running';
  return (
    <div className="space-y-2">
      <OpenLinks preview={view.preview} />
      <div className="flex flex-wrap items-center gap-2">
        {running ? (
          <RunningButtons calls={calls} act={act} busy={busy} refusal={view.refusal} />
        ) : (
          <StartOrCancel view={view} calls={calls} act={act} busy={busy} />
        )}
      </div>
    </div>
  );
}
