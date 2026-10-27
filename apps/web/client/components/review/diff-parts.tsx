// What both diff layouts share: line tones, the gutter, highlighted code, a hunk's spec tags and
// the comments on a line.
import type { DiffLine } from '@union/core/diff';
import type { ReactElement, ReactNode } from 'react';

import type { CommentView } from '../../../src/api-types';
import type { Selection, Side } from '../../lib/diff-selection';
import type { Token } from '../../lib/highlight';
import { headerKey } from '../../lib/spec-hunks';
import { useLineMark, type LineMark } from './report-line-marks';

export const ROW_TONE = {
  add: 'bg-green-50 dark:bg-green-950/40',
  del: 'bg-red-50 dark:bg-red-950/40',
  context: '',
  hunk: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300',
  meta: 'text-zinc-400',
} as const;
export const SELECTED_TONE = 'bg-yellow-100 dark:bg-yellow-900/40';
export const SIGN = { add: '+', del: '−', context: ' ', hunk: '', meta: '' } as const;

/** What both diff layouts need to show and comment on lines. */
export type DiffViewProps = {
  comments: CommentView[];
  tokens: Map<DiffLine, Token[]>;
  selection: Selection | null;
  onSelect: (selection: Selection) => void;
  renderBelow: (side: Side, line: number, comments: CommentView[]) => ReactNode;
  /** By hunk key, the parts of the spec each hunk serves: shown on its header (By spec). */
  hunkTags?: Map<string, string[]>;
  /** Explain on a hunk's header: asks about the whole hunk. */
  onHunk?: (header: string) => void;
};

/** The comments that end on this line of this side. */
export function commentsAt(comments: CommentView[], side: Side, line: number): CommentView[] {
  return comments.filter((comment) => comment.side === side && comment.endLine === line);
}

/** The spec report's mark on a line: a red bar, and where a cited range starts, its items' numbers. */
function Mark({ mark }: { mark: LineMark }): ReactElement | null {
  if (!mark.first) {
    return null;
  }
  return (
    <span
      title={mark.titles.join('\n')}
      className="absolute top-0 left-0.5 rounded bg-red-100 px-1 font-sans text-[10px] font-medium text-red-700 dark:bg-red-950 dark:text-red-300"
    >
      {mark.numbers.join('·')}
    </span>
  );
}

/**
 * A line number; a button that starts (shift: extends) a selection when the line takes comments.
 * `marked`: a line of the new side, which the spec report's items can point at.
 */
export function Gutter({
  value,
  onPick,
  marked = false,
}: {
  value: number | null;
  onPick: ((extend: boolean) => void) | null;
  marked?: boolean;
}): ReactElement {
  const mark = useLineMark(marked ? value : null);
  const cell = `w-12 select-none px-2 text-right align-top ${mark ? 'relative border-r-2 border-red-400' : ''}`;
  if (value === null || !onPick) {
    return (
      <td className={`${cell} text-zinc-400`}>
        {mark ? <Mark mark={mark} /> : null}
        {value ?? ''}
      </td>
    );
  }
  return (
    <td className={cell}>
      {mark ? <Mark mark={mark} /> : null}
      <button
        type="button"
        className="text-zinc-400 hover:text-indigo-600"
        aria-label={`Comment on line ${value}`}
        onClick={(event) => {
          onPick(event.shiftKey);
        }}
      >
        {value}
      </button>
    </td>
  );
}

/** A line's code: highlighted when tokens exist, plain text otherwise. */
export function Code({ line, tokens }: { line: DiffLine; tokens: Token[] | undefined }): ReactNode {
  if (!tokens) {
    return line.text;
  }
  return tokens.map((token) => (
    <span key={token.start} className={token.className}>
      {token.text}
    </span>
  ));
}

/** The parts of the spec a hunk serves, after its header. */
export function HunkTags({
  line,
  tags,
  onHunk,
}: {
  line: DiffLine;
  tags: Map<string, string[]> | undefined;
  onHunk?: (header: string) => void;
}): ReactNode {
  const key = line.kind === 'hunk' && tags ? headerKey(line.text) : null;
  const names = key === null ? [] : (tags?.get(key) ?? []);
  return (
    <>
      {names.map((name) => (
        <span
          key={name}
          className="ml-2 rounded bg-indigo-100 px-1.5 font-sans text-[10px] text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200"
        >
          {name}
        </span>
      ))}
      {line.kind === 'hunk' && onHunk ? (
        <button
          type="button"
          title="Explain this hunk"
          aria-label="Explain this hunk"
          className="ml-2 rounded border border-indigo-300 px-1.5 font-sans text-[10px] text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-950"
          onClick={() => {
            onHunk(line.text);
          }}
        >
          Explain
        </button>
      ) : null}
    </>
  );
}
