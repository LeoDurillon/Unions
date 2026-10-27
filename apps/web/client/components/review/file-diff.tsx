// One file's diff, unified or side by side; comments and the editor appear under the last line they
// cover.
import { parsePatch, type DiffLine } from '@union/core/diff';
import { useMemo, useState, type ReactElement, type ReactNode } from 'react';

import { anchorOf, isSelected, select } from '../../lib/diff-selection';
import { highlightDiff, languageFor, type Token } from '../../lib/highlight';
import {
  Code,
  commentsAt,
  Gutter,
  HunkTags,
  ROW_TONE,
  SELECTED_TONE,
  SIGN,
  type DiffViewProps,
} from './diff-parts';
import { SplitDiff } from './split-diff';

export type DiffView = 'unified' | 'split';

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

function Row({
  line,
  tokens,
  selected,
  onPick,
  hunkTags,
  onHunk,
}: {
  line: DiffLine;
  tokens: Token[] | undefined;
  selected: boolean;
  onPick: (extend: boolean) => void;
  hunkTags: Map<string, string[]> | undefined;
  onHunk: ((header: string) => void) | undefined;
}): ReactElement {
  const anchor = anchorOf(line);
  const oldNumber = line.kind === 'del' || line.kind === 'context' ? line.oldLine : null;
  const newNumber = line.kind === 'add' || line.kind === 'context' ? line.newLine : null;
  const tone = selected ? SELECTED_TONE : ROW_TONE[line.kind];
  return (
    <tr className={tone}>
      <Gutter value={oldNumber} onPick={anchor?.side === 'old' ? onPick : null} />
      <Gutter value={newNumber} onPick={anchor?.side === 'new' ? onPick : null} marked />
      <td className="whitespace-pre px-2">
        <span className="select-none text-zinc-400">{SIGN[line.kind]} </span>
        <Code line={line} tokens={tokens} />
        <HunkTags line={line} tags={hunkTags} onHunk={onHunk} />
      </td>
    </tr>
  );
}

function UnifiedDiff({
  lines: shown,
  comments,
  tokens,
  selection,
  onSelect,
  renderBelow,
  hunkTags,
  onHunk,
}: DiffViewProps & { lines: { line: DiffLine; key: string }[] }): ReactElement {
  return (
    <table className="w-full border-collapse">
      <tbody>
        {shown.map(({ line, key }) => {
          const anchor = anchorOf(line);
          const below = anchor
            ? renderBelow(
                anchor.side,
                anchor.number,
                commentsAt(comments, anchor.side, anchor.number),
              )
            : null;
          return (
            <RowWithBelow key={key} below={below}>
              <Row
                line={line}
                tokens={tokens.get(line)}
                hunkTags={hunkTags}
                onHunk={onHunk}
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

/** One file's diff, unified or side by side; comments and the editor appear under the last line they cover. */
export function FileDiff({
  path,
  patch,
  view,
  ...props
}: Omit<DiffViewProps, 'tokens'> & { path: string; patch: string; view: DiffView }): ReactElement {
  const lines = useMemo(() => keyed(parsePatch(patch)), [patch]);
  const [showAll, setShowAll] = useState(false);
  const shown = useMemo(() => (showAll ? lines : lines.slice(0, FIRST_LINES)), [lines, showAll]);
  const plain = useMemo(() => shown.map(({ line }) => line), [shown]);
  const tokens = useMemo(() => highlightDiff(plain, languageFor(path)), [plain, path]);
  if (lines.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        No line changes to show: the file was renamed, had its mode changed, or is binary.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto font-mono text-xs">
      {view === 'split' ? (
        <SplitDiff lines={plain} tokens={tokens} {...props} />
      ) : (
        <UnifiedDiff lines={shown} tokens={tokens} {...props} />
      )}
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
