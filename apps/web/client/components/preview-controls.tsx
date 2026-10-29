// The preview's addresses and buttons: Start (Restart while it runs, data kept), Stop, Reset (everything dropped,
// after a confirmation, then started fresh) and its compose file.
import type { Preview } from '@union/core';
import type { ReactElement } from 'react';

import type { PreviewView } from '../../src/api-types';
import type { PreviewCalls } from '../lib/use-preview';
import { ConfirmButton } from './confirm-button';
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

const RESET_QUESTION =
  "Remove the preview's containers, volumes (its databases) and the images it built, then start it again? The code in the workspace is kept.";

/** Drops everything the preview holds and starts it fresh: shown once there is something to drop. */
function ResetButton({
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
  if (view.preview === null && view.resetRefusal !== null) {
    return null;
  }
  return (
    <ConfirmButton
      label="Reset preview"
      question={RESET_QUESTION}
      confirmLabel="Reset and start"
      disabled={busy || view.resetRefusal !== null}
      title={view.resetRefusal ?? undefined}
      onConfirm={() => {
        act(calls.reset);
      }}
    />
  );
}

export function Controls({
  view,
  calls,
  act,
  busy,
  onCompose,
}: {
  view: PreviewView;
  calls: PreviewCalls;
  act: Act;
  busy: boolean;
  onCompose: () => void;
}): ReactElement {
  const status = view.preview?.status;
  const running = status === 'running';
  return (
    <div className="space-y-2">
      <OpenLinks preview={view.preview} />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={running ? 'secondary' : 'primary'}
          disabled={busy || view.refusal !== null}
          title={
            view.refusal ?? (running ? 'Updates the running preview; its data is kept' : undefined)
          }
          onClick={() => {
            act(calls.start);
          }}
        >
          {running ? 'Restart' : 'Start preview'}
        </Button>
        {running || status === 'failed' ? (
          <Button
            disabled={busy}
            onClick={() => {
              act(calls.stop);
            }}
          >
            Stop
          </Button>
        ) : null}
        <ResetButton view={view} calls={calls} act={act} busy={busy} />
        <Button onClick={onCompose}>
          {view.preview?.override ? 'Compose file (yours)' : 'Compose file'}
        </Button>
      </div>
    </div>
  );
}
