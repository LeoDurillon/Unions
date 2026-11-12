// One tool call of an agent log as a row: its name, its argument, what it gave, its time. It opens to the
// call's whole input and result.

import { useState, type ReactElement } from 'react';

import type { ToolCallPart } from '../../lib/log/agent-events';
import { formatWhen } from '../../lib/ui/relative-time';

const CHIP =
  'w-16 shrink-0 truncate rounded-md border border-zinc-200 bg-zinc-50 px-1.5 text-center text-[11px] leading-5 font-semibold text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300';
const PART =
  'max-h-72 overflow-auto rounded-lg bg-zinc-950 px-3 py-2 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap text-zinc-200';

/** The line's time, at the row's end. */
export function LineTime({ at }: { at: number | undefined }): ReactElement | null {
  return at === undefined ? null : (
    <span className="shrink-0 pt-0.5 font-mono text-[11px] text-zinc-500 tabular-nums">
      {formatWhen(at, 'time')}
    </span>
  );
}

/** What the call gave, in a line: its first line, that it failed, or that it still runs. */
export function resultSummary(call?: ToolCallPart): string | null {
  if (call === undefined) {
    return null;
  }
  if (call.output === undefined) {
    return 'running…';
  }
  const first =
    call.output
      .split('\n')
      .find((line) => line.trim() !== '')
      ?.trim() ?? '';
  if (call.failed === true) {
    return `failed${first ? `: ${first}` : ''}`;
  }
  return first === '' ? 'no output' : first;
}

function Part({ label, text }: { label: string; text: string | undefined }): ReactElement | null {
  if (text === undefined || text === '') {
    return null;
  }
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold tracking-wide text-zinc-500 uppercase">{label}</p>
      <pre className={PART}>{text}</pre>
    </div>
  );
}

/** A tool call: a row that opens to its whole input and result once the call has them. */
export function ToolRow({
  text,
  call,
  at,
}: {
  text: string;
  call: ToolCallPart | undefined;
  at: number | undefined;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const space = text.indexOf(' ');
  const name = space === -1 ? text : text.slice(0, space);
  const argument = space === -1 ? '' : text.slice(space + 1);
  const summary = resultSummary(call);
  return (
    <div className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-800/60">
      <button
        type="button"
        aria-expanded={call ? open : undefined}
        disabled={call === undefined}
        title={text}
        onClick={() => {
          setOpen(!open);
        }}
        className="flex w-full items-start gap-3 py-1.5 text-left enabled:cursor-pointer enabled:hover:bg-zinc-50 dark:enabled:hover:bg-zinc-800/40"
      >
        <span className={CHIP}>{name}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono text-xs text-zinc-800 dark:text-zinc-200">
            {argument}
          </span>
          {summary === null ? null : (
            <span
              className={`block truncate font-mono text-[11px] ${call?.failed === true ? 'text-red-600 dark:text-red-400' : 'text-zinc-500'}`}
            >
              {summary}
            </span>
          )}
        </span>
        <LineTime at={at} />
      </button>
      {open && call ? (
        <div className="mb-2 ml-19 space-y-2">
          <Part label="Input" text={call.input} />
          <Part label="Result" text={call.output} />
        </div>
      ) : null}
    </div>
  );
}
