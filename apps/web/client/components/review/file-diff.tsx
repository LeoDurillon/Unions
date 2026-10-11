import { parsePatch, type DiffLine } from '@union/core/diff';
import { useMemo, useState, type ReactElement, type ReactNode } from 'react';

import type { CommentView } from '../../../src/api-types';
import { anchorOf, isSelected, select, type Selection } from '../../lib/diff-selection';

const ROW_TONE = {
  add: 'bg-green-50 dark:bg-green-950/40',
  del: 'bg-red-50 dark:bg-red-950/40',
  context: '',
  hunk: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300',
  meta: 'text-zinc-400',
} as const;
const SIGN = { add: '+', del: '−', context: ' ', hunk: '', meta: '' } as const;
/** Stable row keys from the line numbers; hunk headers and notes are numbered in order. */
function keyed(lines: DiffLine[]): { line: DiffLine; key: string }[] {
  let other = 0;
  return lines.map((line) => {
    switch (line.kind) {
      case 'add': {
        return { line, key: `a${line.newLine}` };
      }
      case 'del': {
        return { line, key: `d${line.oldLine}` };
      }
      case 'context': {
        return { line, key: `c${line.oldLine}-${line.newLine}` };
      }
      case 'hunk':
      case 'meta': {
        other += 1;
        return { line, key: `${line.kind}${other}` };
      }
      default: {
        return { line, key: 'unknown' };
      }
    }
  });
}

/** Rendering stays fast on huge files: the rest is one click away. */
const FIRST_LINES = 3000;

function Gutter({
  value,
  onPick,
}: {
  value: number | null;
  onPick: ((extend: boolean) => void) | null;
}): ReactElement {
  if (value === null || !onPick) {
    return <td className="w-12 select-none px-2 text-right text-zinc-400">{value ?? ''}</td>;
  }
  return (
    <td className="w-12 select-none px-2 text-right">
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

function Row({
  line,
  selected,
  onPick,
}: {
  line: DiffLine;
  selected: boolean;
  onPick: (extend: boolean) => void;
}): ReactElement {
  const anchor = anchorOf(line);
  const oldNumber = line.kind === 'del' || line.kind === 'context' ? line.oldLine : null;
  const newNumber = line.kind === 'add' || line.kind === 'context' ? line.newLine : null;
  const tone = selected ? 'bg-yellow-100 dark:bg-yellow-900/40' : ROW_TONE[line.kind];
  return (
    <tr className={tone}>
      <Gutter value={oldNumber} onPick={anchor?.side === 'old' ? onPick : null} />
      <Gutter value={newNumber} onPick={anchor?.side === 'new' ? onPick : null} />
      <td className="whitespace-pre px-2">
        <span className="select-none text-zinc-400">{SIGN[line.kind]} </span>
        {line.text}
      </td>
    </tr>
  );
}

type TableProps = {
  lines: { line: DiffLine; key: string }[];
  comments: CommentView[];
  selection: Selection | null;
  onSelect: (selection: Selection) => void;
  renderBelow: (side: 'old' | 'new', line: number, comments: CommentView[]) => ReactNode;
};

function DiffTable({
  lines: shown,
  comments,
  selection,
  onSelect,
  renderBelow,
}: TableProps): ReactElement {
  return (
    <table className="w-full border-collapse">
      <tbody>
        {shown.map(({ line, key }) => {
          const anchor = anchorOf(line);
          const here = anchor
            ? comments.filter(
                (comment) => comment.side === anchor.side && comment.endLine === anchor.number,
              )
            : [];
          const below = anchor ? renderBelow(anchor.side, anchor.number, here) : null;
          return (
            <RowWithBelow key={key} below={below}>
              <Row
                line={line}
                selected={anchor !== null && isSelected(selection, anchor.side, anchor.number)}
                onPick={(extend) => {
                  if (anchor) {
                    onSelect(select(selection, anchor.side, anchor.number, extend));
                  }
                }}
              />
            </RowWithBelow>
          );
        })}
      </tbody>
    </table>
  );
}

/** One file's diff; comments and the editor appear under the last line they cover. */
export function FileDiff({
  patch,
  comments,
  selection,
  onSelect,
  renderBelow,
}: {
  patch: string;
  comments: CommentView[];
  selection: Selection | null;
  onSelect: (selection: Selection) => void;
  renderBelow: (side: 'old' | 'new', line: number, comments: CommentView[]) => ReactNode;
}): ReactElement {
  const lines = useMemo(() => keyed(parsePatch(patch)), [patch]);
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? lines : lines.slice(0, FIRST_LINES);
  if (lines.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        No line changes to show: the file was renamed, had its mode changed, or is binary.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto font-mono text-xs">
      <DiffTable
        lines={shown}
        comments={comments}
        selection={selection}
        onSelect={onSelect}
        renderBelow={renderBelow}
      />
      {lines.length > shown.length ? (
        <button
          type="button"
          className="m-2 text-indigo-600 underline"
          onClick={() => {
            setShowAll(true);
          }}
        >
          Show the remaining {lines.length - shown.length} lines
        </button>
      ) : null}
    </div>
  );
}

function RowWithBelow({
  below,
  children,
}: {
  below: ReactNode;
  children: ReactNode;
}): ReactElement {
  return (
    <>
      {children}
      {below ? (
        <tr>
          <td colSpan={3} className="px-4 py-2 font-sans">
            {below}
          </td>
        </tr>
      ) : null}
    </>
  );
}
