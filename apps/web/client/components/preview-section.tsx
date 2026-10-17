import type { Preview } from '@union/core';
import { useState, type ReactElement, type ReactNode } from 'react';

import type { PreviewView } from '../../src/api-types';
import type { Tone } from '../lib/labels';
import type { PreviewTarget } from '../lib/preview-target';
import { openSettings } from '../lib/settings-sections';
import { usePreview, type PreviewCalls } from '../lib/use-preview';
import { PreviewComposeDialog } from './preview-compose-dialog';
import { PreviewE2e } from './preview-e2e';
import { Badge, Button, ErrorText } from './ui';

export const PREVIEW_STATUS: Record<Preview['status'], { label: string; tone: Tone }> = {
  starting: { label: 'Starting…', tone: 'blue' },
  running: { label: 'Running', tone: 'green' },
  stopping: { label: 'Stopping…', tone: 'blue' },
  stopped: { label: 'Stopped', tone: 'neutral' },
  failed: { label: 'Failed', tone: 'red' },
};

type Calls = PreviewCalls;
type Act = (call: () => Promise<PreviewView>) => void;

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

function Controls({
  view,
  calls,
  act,
  busy,
  onCompose,
}: {
  view: PreviewView;
  calls: Calls;
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
          title={view.refusal ?? undefined}
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
        <Button onClick={onCompose}>
          {view.preview?.override ? 'Compose file (yours)' : 'Compose file'}
        </Button>
      </div>
    </div>
  );
}

function LogTail({
  preview,
  calls,
  act,
  busy,
}: {
  preview: Preview;
  calls: Calls;
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
            act(calls.logs);
          }}
        >
          Read again
        </Button>
      ) : null}
    </details>
  );
}

/** Opens the project's preview settings (closing the ticket). */
function SettingsLink({
  className,
  children,
}: {
  className: string;
  children: string;
}): ReactElement {
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        openSettings('preview-services');
      }}
    >
      {children}
    </button>
  );
}

function Heading({ preview }: { preview: Preview | null }): ReactElement {
  return (
    <h3 className="flex items-center gap-2 text-sm font-semibold">
      Preview
      {preview ? (
        <Badge tone={PREVIEW_STATUS[preview.status].tone}>
          {PREVIEW_STATUS[preview.status].label}
        </Badge>
      ) : null}
      <SettingsLink className="ml-auto text-xs font-normal text-zinc-500 hover:underline">
        Settings
      </SettingsLink>
    </h3>
  );
}

function NotSetUp(): ReactElement {
  return (
    <p className="text-xs text-zinc-500">
      Previews are not set up for this project.{' '}
      <SettingsLink className="text-indigo-600 hover:underline dark:text-indigo-400">
        Set up previews
      </SettingsLink>
    </p>
  );
}

/**
 * A ticket's or a pull request's preview: its compose environment run from the workspace, opened
 * through the proxy. Start and stop are commands the worker runs; a ticket's panel follows the live
 * events, a pull request's polls while one is on its way. `notice` goes above the controls;
 * `canRevise`: a ticket's failing tests can go back to the agent.
 */
export function PreviewSection({
  target,
  notice,
  canRevise = false,
}: {
  target: PreviewTarget;
  notice?: ReactNode;
  canRevise?: boolean;
}): ReactElement | null {
  const { query, calls, act, busy, error } = usePreview(target);
  const [composeOpen, setComposeOpen] = useState(false);
  const view = query.data;
  if (!view) {
    return null;
  }
  if (!view.configured) {
    return <NotSetUp />;
  }
  const { preview } = view;
  return (
    <section className="space-y-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
      <Heading preview={preview} />
      {notice}
      <Controls
        view={view}
        calls={calls}
        act={act}
        busy={busy}
        onCompose={() => {
          setComposeOpen(true);
        }}
      />
      <PreviewComposeDialog
        target={target}
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
      <ErrorText error={error} />
      {preview ? <LogTail preview={preview} calls={calls} act={act} busy={busy} /> : null}
      <PreviewE2e target={target} view={view} canRevise={canRevise} />
    </section>
  );
}
