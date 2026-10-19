import type { DiffLine } from '@union/core/diff';
import type { ReactElement, ReactNode } from 'react';

import { isSelected, select, type Side } from '../../lib/diff-selection';
import { splitRows, type SplitRow } from '../../lib/split-rows';
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

const EMPTY_CELL = 'bg-zinc-100 dark:bg-zinc-900';
const CODE_CELL = 'px-2 align-top wrap-anywhere whitespace-pre-wrap';

/** The line a half-row comments on: removed lines on the left, added and context lines on the right. */
function anchorFor(line: DiffLine | null, side: Side): number | null {
  if (side === 'old') {
    return line?.kind === 'del' ? line.oldLine : null;
  }
  return line?.kind === 'add' || line?.kind === 'context' ? line.newLine : null;
}

function Half({
  line,
  number,
  side,
  props,
}: {
  line: DiffLine | null;
  number: number | null;
  side: Side;
  props: DiffViewProps;
}): ReactElement {
  if (!line) {
    return (
      <>
        <td className={EMPTY_CELL} aria-label="No line" />
        <td className={`${CODE_CELL} ${EMPTY_CELL}`} aria-label="No line on this side" />
      </>
    );
  }
  const anchor = anchorFor(line, side);
  const selected = anchor !== null && isSelected(props.selection, side, anchor);
  const tone = selected ? SELECTED_TONE : ROW_TONE[line.kind];
  const pick =
    anchor === null
      ? null
      : (extend: boolean): void => {
          props.onSelect(select(props.selection, side, anchor, extend));
        };
  return (
    <>
      <Gutter value={number} onPick={pick} />
      <td className={`${CODE_CELL} ${tone}`}>
        <span className="select-none text-zinc-400">{SIGN[line.kind]} </span>
        <Code line={line} tokens={props.tokens.get(line)} />
      </td>
    </>
  );
}

function Below({ row, props }: { row: SplitRow; props: DiffViewProps }): ReactNode {
  if (row.kind !== 'pair') {
    return null;
  }
  const thread = (line: DiffLine | null, side: Side): ReactNode => {
    const anchor = anchorFor(line, side);
    return anchor === null
      ? null
      : props.renderBelow(side, anchor, commentsAt(props.comments, side, anchor));
  };
  const left = thread(row.left, 'old');
  const right = thread(row.right, 'new');
  if (!left && !right) {
    return null;
  }
  return (
    <tr>
      <td colSpan={2} className="px-4 py-2 align-top font-sans">
        {left}
      </td>
      <td colSpan={2} className="px-4 py-2 align-top font-sans">
        {right}
      </td>
    </tr>
  );
}

function rowKey(row: SplitRow, index: number): string {
  if (row.kind === 'full') {
    return `f${index}`;
  }
  return `p${row.left?.kind === 'del' ? row.left.oldLine : ''}-${row.right?.newLine ?? ''}`;
}

/** Old file on the left, new on the right; removed and added runs face each other. */
export function SplitDiff({
  lines,
  ...props
}: DiffViewProps & { lines: DiffLine[] }): ReactElement {
  return (
    <table className="w-full table-fixed border-collapse">
      <colgroup>
        <col className="w-12" />
        <col />
        <col className="w-12" />
        <col />
      </colgroup>
      <tbody>
        {splitRows(lines).map((row, index) => (
          <SplitRowView key={rowKey(row, index)} row={row} props={props} />
        ))}
      </tbody>
    </table>
  );
}

function SplitRowView({ row, props }: { row: SplitRow; props: DiffViewProps }): ReactElement {
  if (row.kind === 'full') {
    return (
      <tr className={ROW_TONE[row.line.kind]}>
        <td colSpan={4} className="px-2 whitespace-pre">
          {row.line.text}
          <HunkTags line={row.line} tags={props.hunkTags} onHunk={props.onHunk} />
        </td>
      </tr>
    );
  }
  const oldNumber =
    row.left?.kind === 'del' || row.left?.kind === 'context' ? row.left.oldLine : null;
  return (
    <>
      <tr>
        <Half line={row.left} number={oldNumber} side="old" props={props} />
        <Half line={row.right} number={row.right?.newLine ?? null} side="new" props={props} />
      </tr>
      <Below row={row} props={props} />
    </>
  );
}
