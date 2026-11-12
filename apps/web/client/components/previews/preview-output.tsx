// What a preview printed: its start as it goes (a ticket's), and its services' last lines.

import type { Preview } from '@union/core';
import { useEffect, useRef, type ReactElement, type RefObject } from 'react';

import { stripAnsi } from '../../lib/log/strip-ansi';
import type { PreviewTarget } from '../../lib/preview/preview-target';
import type { PreviewCalls } from '../../lib/preview/use-preview';
import { useStartOutput } from '../../lib/preview/use-start-output';
import { formatWhen } from '../../lib/ui/relative-time';
import { Button } from '../ui/ui';
import type { Act } from './preview-controls';

const OUTPUT_CLASS =
  'mt-1.5 max-h-56 overflow-auto rounded-lg bg-zinc-950 px-3 py-2 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap text-zinc-200';

/** A box of output kept scrolled to its end, where the last lines are, whenever `text` changes. */
function useScrolledToEnd(text: string): RefObject<HTMLPreElement | null> {
  const box = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (text !== '') {
      box.current?.scrollTo({ top: box.current.scrollHeight });
    }
  }, [text]);
  return box;
}

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
  const box = useScrolledToEnd(lines.join('\n'));
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
  const box = useScrolledToEnd(preview.logTail ?? '');
  if (!preview.logTail && preview.status !== 'running') {
    return null;
  }
  return (
    <details className="text-xs" open={preview.status === 'failed'}>
      <summary className="cursor-pointer text-zinc-500">
        Services&apos; output
        {preview.logAt ? ` (read ${formatWhen(preview.logAt, 'time')})` : ''}
      </summary>
      <pre ref={box} className={OUTPUT_CLASS}>
        {stripAnsi(preview.logTail ?? 'Nothing yet.')}
      </pre>
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
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 dark:border-red-900 dark:bg-red-950/40">
          <p className="text-sm font-semibold text-red-800 dark:text-red-300">
            The preview failed to start
          </p>
          <pre className="font-mono text-xs whitespace-pre-wrap text-red-700 dark:text-red-400">
            {preview.error}
          </pre>
        </div>
      ) : null}
      <LogTail preview={preview} calls={calls} act={act} busy={busy} />
    </>
  );
}
