// The last end-to-end result in a few words, and its output and command, folded.

import type { Preview } from '@union/core';
import type { ReactElement } from 'react';

import type { Tone } from '../../lib/board/labels';
import { stripAnsi } from '../../lib/log/strip-ansi';
import { formatWhen, timeAgo } from '../../lib/ui/relative-time';
import { useNow } from '../../lib/ui/use-now';
import { Badge } from '../ui/ui';

const STATUS: Record<NonNullable<Preview['e2eStatus']>, { label: string; tone: Tone }> = {
  running: { label: 'Running…', tone: 'blue' },
  green: { label: 'Passing', tone: 'green' },
  red: { label: 'Failing', tone: 'red' },
  skipped: { label: 'Not run', tone: 'neutral' },
};

const OUTPUT_CLASS =
  'mt-1 max-h-72 overflow-auto rounded-md bg-zinc-950 p-2 whitespace-pre-wrap text-zinc-100';

/** The last result in a few words: its badge, how long ago, its screenshots. */
export function LastResult({
  preview,
  shotsWhere,
}: {
  preview: Preview;
  shotsWhere: string;
}): ReactElement | null {
  const now = useNow(false);
  if (!preview.e2eStatus) {
    return null;
  }
  const status = STATUS[preview.e2eStatus];
  const shots = preview.e2eScreenshots ?? 0;
  return (
    <>
      <Badge tone={status.tone}>{status.label}</Badge>
      {preview.e2eAt ? (
        <span className="text-xs text-zinc-500" title={formatWhen(preview.e2eAt)}>
          {timeAgo(preview.e2eAt, now)}
        </span>
      ) : null}
      {shots > 0 ? (
        <span className="text-xs text-zinc-500">
          {shots} failure screenshot(s) {shotsWhere}
        </span>
      ) : null}
    </>
  );
}

/** Whether the result is stale, then the last output and the command, folded; a fresh failure's output is open. */
export function Details({
  command,
  preview,
  stale,
}: {
  command: string;
  preview: Preview | null;
  /** Why the result may not describe the preview now. */
  stale: string | null;
}): ReactElement {
  const output = preview?.e2eOutput ?? null;
  return (
    <div className="space-y-1 text-xs">
      {stale === null ? null : <p className="text-amber-700 dark:text-amber-400">{stale}</p>}
      {output ? (
        <details open={preview?.e2eStatus === 'red' && stale === null}>
          <summary className="cursor-pointer text-zinc-500">Output</summary>
          <pre className={OUTPUT_CLASS}>{stripAnsi(output)}</pre>
        </details>
      ) : null}
      <details>
        <summary className="cursor-pointer text-zinc-500">Command</summary>
        <code className="mt-1 block whitespace-pre-wrap text-zinc-600 dark:text-zinc-400">
          {command}
        </code>
      </details>
    </div>
  );
}
