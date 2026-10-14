import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Preview } from '@union/core';
import { useState, type ReactElement } from 'react';

import type { PreviewView } from '../../src/api-types';
import type { Tone } from '../lib/labels';
import { previewApi } from '../lib/preview-api';
import { PreviewComposeDialog } from './preview-compose-dialog';
import { Badge, Button, ErrorText } from './ui';

const STATUS: Record<Preview['status'], { label: string; tone: Tone }> = {
  starting: { label: 'Starting…', tone: 'blue' },
  running: { label: 'Running', tone: 'green' },
  stopping: { label: 'Stopping…', tone: 'blue' },
  stopped: { label: 'Stopped', tone: 'neutral' },
  failed: { label: 'Failed', tone: 'red' },
};

type Act = (call: (ticketId: number) => Promise<PreviewView>) => void;

/** Every exposed service's address; previews from before several services were possible have one. */
function OpenLinks({ preview }: { preview: Preview | null }): ReactElement | null {
  if (preview?.status !== 'running') {
    return null;
  }
  const urls = preview.urls ?? (preview.url ? [{ service: '', url: preview.url }] : []);
  return (
    <>
      {urls.map(({ service, url }) => (
        <a
          key={url}
          className="text-sm text-indigo-600 hover:underline dark:text-indigo-400"
          href={url}
          target="_blank"
          rel="noreferrer"
          title={service === '' ? undefined : `The ${service} service`}
        >
          Open {url}
        </a>
      ))}
    </>
  );
}

function Controls({
  view,
  act,
  busy,
  onCompose,
}: {
  view: PreviewView;
  act: Act;
  busy: boolean;
  onCompose: () => void;
}): ReactElement {
  const status = view.preview?.status;
  const running = status === 'running';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <OpenLinks preview={view.preview} />
      <Button
        variant={running ? 'secondary' : 'primary'}
        disabled={busy || view.refusal !== null}
        title={view.refusal ?? undefined}
        onClick={() => {
          act(previewApi.start);
        }}
      >
        {running ? 'Restart' : 'Start preview'}
      </Button>
      {running || status === 'failed' ? (
        <Button
          disabled={busy}
          onClick={() => {
            act(previewApi.stop);
          }}
        >
          Stop
        </Button>
      ) : null}
      <Button onClick={onCompose}>
        {view.preview?.override ? 'Compose file (yours)' : 'Compose file'}
      </Button>
    </div>
  );
}

function LogTail({
  preview,
  act,
  busy,
}: {
  preview: Preview;
  act: Act;
  busy: boolean;
}): ReactElement | null {
  if (!preview.logTail && preview.status !== 'running') {
    return null;
  }
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-zinc-500">
        Services&apos; output
        {preview.logAt ? ` (read ${new Date(preview.logAt).toLocaleTimeString()})` : ''}
      </summary>
      <pre className="mt-1 max-h-72 overflow-auto rounded-md bg-zinc-950 p-2 whitespace-pre-wrap text-zinc-100">
        {preview.logTail ?? 'Nothing yet.'}
      </pre>
      {preview.status === 'running' ? (
        <Button
          disabled={busy}
          onClick={() => {
            act(previewApi.logs);
          }}
        >
          Read again
        </Button>
      ) : null}
    </details>
  );
}

/**
 * The ticket's preview: its compose environment run from the workspace, opened through the proxy.
 * Start and stop are commands the worker runs; the panel follows the live events.
 */
export function PreviewSection({ ticketId }: { ticketId: number }): ReactElement | null {
  const queryClient = useQueryClient();
  const queryKey = ['ticket', ticketId, 'preview'];
  const query = useQuery({ queryKey, queryFn: () => previewApi.get(ticketId) });
  const mutation = useMutation({
    mutationFn: (call: (id: number) => Promise<PreviewView>) => call(ticketId),
    onSuccess: (view) => {
      queryClient.setQueryData(queryKey, view);
    },
  });
  const [composeOpen, setComposeOpen] = useState(false);
  const view = query.data;
  if (!view?.configured) {
    return null;
  }
  const { preview } = view;
  const act: Act = (call) => {
    mutation.mutate(call);
  };
  return (
    <section className="space-y-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        Preview
        {preview ? (
          <Badge tone={STATUS[preview.status].tone}>{STATUS[preview.status].label}</Badge>
        ) : null}
      </h3>
      <Controls
        view={view}
        act={act}
        busy={mutation.isPending}
        onCompose={() => {
          setComposeOpen(true);
        }}
      />
      <PreviewComposeDialog
        ticketId={ticketId}
        view={view}
        open={composeOpen}
        onClose={() => {
          setComposeOpen(false);
        }}
      />
      {preview?.status === 'failed' && preview.error ? (
        <pre className="text-xs whitespace-pre-wrap text-red-600 dark:text-red-400">
          {preview.error}
        </pre>
      ) : null}
      <ErrorText error={query.error ?? mutation.error} />
      {preview ? <LogTail preview={preview} act={act} busy={mutation.isPending} /> : null}
    </section>
  );
}
