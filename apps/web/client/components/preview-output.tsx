// What a preview printed: its start as it goes (a ticket's), and its services' last lines.

import type { Preview } from '@union/core';
import { useEffect, useRef, type ReactElement } from 'react';

import type { PreviewTarget } from '../lib/preview/preview-target';
import type { PreviewCalls } from '../lib/preview/use-preview';
import { stripAnsi } from '../lib/strip-ansi';
import { useStartOutput } from '../lib/use-start-output';
import type { Act } from './preview-controls';
import { Button } from './ui';

const OUTPUT_CLASS =
  'mt-1 max-h-72 overflow-auto rounded-md bg-zinc-950 p-2 whitespace-pre-wrap text-zinc-100';

/** The start's output as it arrives, kept scrolled to its end; a pull request's says nothing until it ends. */
function StartOutput({
  target,
  preview,
}: {
  target: PreviewTarget;
  preview: Preview;
}): ReactElement {
  const lines = useStartOutput(
    target.kind === 'ticket' ? target.ticketId : null,
    preview.startedAt,
  );
  const box = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (lines.length > 0) {
      box.current?.scrollTo({ top: box.current.scrollHeight });
    }
  }, [lines]);
  return (
    <details className="text-xs" open>
      <summary className="cursor-pointer text-zinc-500">Start output</summary>
      <pre ref={box} className={OUTPUT_CLASS}>
        {lines.length > 0 ? stripAnsi(lines.join('\n')) : 'Waiting for the build and the services…'}
      </pre>
    </details>
  );
}

/** The services' last lines, read at the start's end or on demand; open when the start failed. */
function LogTail({
  preview,
  calls,
  act,
  busy,
}: {
  preview: Preview;
  calls: PreviewCalls;
  act: Act;
  busy: boolean;
}): ReactElement | null {
  if (!preview.logTail && preview.status !== 'running') {
    return null;
  }
  return (
    <details className="text-xs" open={preview.status === 'failed'}>
      <summary className="cursor-pointer text-zinc-500">
        Services&apos; output
        {preview.logAt ? ` (read ${new Date(preview.logAt).toLocaleTimeString()})` : ''}
      </summary>
      <pre className={OUTPUT_CLASS}>{stripAnsi(preview.logTail ?? 'Nothing yet.')}</pre>
      {preview.status === 'running' ? (
        <Button
          size="sm"
          className="mt-1"
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

/** What the preview printed: its start while it starts; otherwise why it failed and its services' last lines. */
export function PreviewOutput({
  target,
  preview,
  calls,
  act,
  busy,
}: {
  target: PreviewTarget;
  preview: Preview;
  calls: PreviewCalls;
  act: Act;
  busy: boolean;
}): ReactElement | null {
  if (preview.status === 'starting') {
    return <StartOutput target={target} preview={preview} />;
  }
  return (
    <>
      {preview.status === 'failed' && preview.error ? (
        <pre className="text-xs whitespace-pre-wrap text-red-600 dark:text-red-400">
          {preview.error}
        </pre>
      ) : null}
      <LogTail preview={preview} calls={calls} act={act} busy={busy} />
    </>
  );
}
