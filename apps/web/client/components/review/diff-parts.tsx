import type { DiffLine } from '@union/core/diff';
import type { ReactElement, ReactNode } from 'react';

import type { CommentView } from '../../../src/api-types';
import type { Selection, Side } from '../../lib/diff-selection';
import type { Token } from '../../lib/highlight';

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
};

/** The comments that end on this line of this side. */
export function commentsAt(comments: CommentView[], side: Side, line: number): CommentView[] {
  return comments.filter((comment) => comment.side === side && comment.endLine === line);
}

/** A line number; a button that starts (shift: extends) a selection when the line takes comments. */
export function Gutter({
  value,
  onPick,
}: {
  value: number | null;
  onPick: ((extend: boolean) => void) | null;
}): ReactElement {
  if (value === null || !onPick) {
    return (
      <td className="w-12 select-none px-2 text-right align-top text-zinc-400">{value ?? ''}</td>
    );
  }
  return (
    <td className="w-12 select-none px-2 text-right align-top">
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
