// Loading placeholders: grey shapes that pulse where the content will land, and why it waits.
// Lines, table rows, a list with avatars and a log share one bone; only outside services (GitHub,
// Notion, Jira) get a reason line, local data shows its shapes alone.

import type { ReactElement, ReactNode } from 'react';

/** Widths that read as text of uneven length, used in turn by the shapes below. */
const LINE_WIDTHS = ['94%', '86%', '62%', '78%', '55%', '70%', '48%', '82%'] as const;
const ROUNDER = /\brounded-(?:full|lg|xl|2xl)\b/u;
const TITLE_WIDTHS = ['40%', '55%', '35%', '48%'] as const;

function widthAt(widths: readonly string[], index: number): string {
  return widths[index % widths.length] ?? '100%';
}

function range(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index);
}

/** One grey shape; its height and shape come from `className`. */
export function Bone({
  className = 'h-3',
  width,
}: {
  className?: string;
  width?: string;
}): ReactElement {
  // A rounder shape asked in `className` replaces the default, which CSS order would otherwise keep.
  const radius = ROUNDER.test(className) ? '' : 'rounded-md';
  return (
    <span
      aria-hidden="true"
      className={`block animate-pulse bg-zinc-200 motion-reduce:animate-none dark:bg-zinc-800 ${radius} ${className}`}
      style={width === undefined ? undefined : { width }}
    />
  );
}

/** The spinner and the outside service it waits on, under the shapes. */
function WaitReason({ children }: { children: ReactNode }): ReactElement {
  return (
    <p className="flex items-center gap-2 text-xs text-zinc-500">
      <span
        aria-hidden="true"
        className="size-3 animate-spin rounded-full border-2 border-zinc-200 border-t-indigo-600 motion-reduce:animate-none dark:border-zinc-700 dark:border-t-indigo-400"
      />
      {children}
    </p>
  );
}

/** Wraps the shapes: screen readers hear `label` once, not each shape. */
export function Loading({
  label,
  reason,
  className = 'space-y-2',
  children,
}: {
  label: string;
  /** The outside service it waits on, e.g. "Reading from GitHub". */
  reason?: string;
  className?: string;
  children: ReactNode;
}): ReactElement {
  return (
    <output aria-busy="true" aria-label={label} className="block space-y-3">
      <div className={className}>{children}</div>
      {reason === undefined ? null : <WaitReason>{reason}</WaitReason>}
    </output>
  );
}

/** Lines of text: a description, a paragraph. `title` adds a taller first line. */
export function SkeletonLines({
  count = 3,
  title = false,
}: {
  count?: number;
  title?: boolean;
}): ReactElement {
  return (
    <>
      {title ? <Bone className="h-4" width="45%" /> : null}
      {range(count).map((index) => (
        <Bone key={index} width={widthAt(LINE_WIDTHS, index)} />
      ))}
    </>
  );
}

/** Rows of a table; `columns` is the grid's template class, its first cell a line of text. */
export function SkeletonRows({
  count,
  columns,
  cells,
  rowClassName = 'py-1.5',
}: {
  count: number;
  columns: string;
  /** Cells after the first. */
  cells: number;
  rowClassName?: string;
}): ReactElement {
  return (
    <>
      {range(count).map((index) => (
        <div key={index} className={`grid items-center gap-3 ${columns} ${rowClassName}`}>
          <Bone width={widthAt(LINE_WIDTHS, index + 2)} />
          {range(cells).map((cell) => (
            <Bone key={cell} />
          ))}
        </div>
      ))}
    </>
  );
}

/** A list of comments or people: an avatar, a name, a line or two. */
export function SkeletonList({
  count,
  lines = 1,
}: {
  count: number;
  lines?: number;
}): ReactElement {
  return (
    <>
      {range(count).map((index) => (
        <div key={index} className="flex gap-2.5">
          <Bone className="size-6.5 shrink-0 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Bone className="h-3" width={widthAt(TITLE_WIDTHS, index)} />
            {range(lines).map((line) => (
              <Bone key={line} className="h-2.5" width={widthAt(LINE_WIDTHS, index + line)} />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

/** An agent's Log: a time, then a line. */
export function SkeletonLog({ count = 7 }: { count?: number }): ReactElement {
  return (
    <>
      {range(count).map((index) => (
        <div key={index} className="flex items-center gap-2.5">
          <Bone className="h-2.5 w-13 shrink-0" />
          <Bone className="h-2.5" width={widthAt(LINE_WIDTHS, index)} />
        </div>
      ))}
    </>
  );
}
