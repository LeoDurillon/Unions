import type { ReactElement } from 'react';

import type { DiffFileSummary } from '../../../src/api-types';
import type { GroupingView } from '../../../src/routes/review-groupings';
import { FileRows, type RowOptions } from './file-rows';

function Group({
  title,
  hint,
  files,
  rows,
}: {
  title: string;
  hint: string;
  files: DiffFileSummary[];
  rows: RowOptions;
}): ReactElement {
  return (
    <details open className="group">
      <summary
        className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
        title={hint}
      >
        <span className="min-w-0 flex-1 truncate">{title}</span>
        <span className="font-normal text-zinc-400">{files.length}</span>
      </summary>
      <div className="mt-0.5 mb-2">
        <FileRows files={files} {...rows} />
      </div>
    </details>
  );
}

function Missing({ missing }: { missing: { spec: string; note: string }[] }): ReactElement | null {
  if (missing.length === 0) {
    return null;
  }
  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs dark:border-amber-800 dark:bg-amber-950">
      <p className="mb-1 font-semibold text-amber-800 dark:text-amber-300">
        ⚠ Not found in the change
      </p>
      <ul className="space-y-1 text-amber-900 dark:text-amber-200">
        {missing.map((item) => (
          <li key={item.spec} title={item.note}>
            {item.spec}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The files under the parts of the specification they implement (a file can be under several), then
 * the files no part covers, then the parts no file implements. Files the grouping did not see (the
 * change moved since) count as not covered.
 */
export function SpecGroups({
  files,
  grouping,
  rows,
}: {
  files: DiffFileSummary[];
  grouping: GroupingView;
  rows: RowOptions;
}): ReactElement {
  const result = grouping.result ?? { groups: [], unrelated: [], missing: [] };
  const byPath = new Map(files.map((file) => [file.path, file]));
  const grouped = new Set(result.groups.flatMap((group) => group.files));
  const reasons = new Map(result.unrelated.map((item) => [item.path, item.reason]));
  const rest = files.filter((file) => !grouped.has(file.path));
  return (
    <div className="space-y-1">
      {result.groups.map((group) => {
        const members = group.files.flatMap((path) => byPath.get(path) ?? []);
        return members.length === 0 ? null : (
          <Group
            key={group.key}
            title={group.title}
            hint={[group.spec, group.summary].filter((part) => part !== '').join('\n\n')}
            files={members}
            rows={rows}
          />
        );
      })}
      {rest.length > 0 ? (
        <Group
          title="Not in the spec"
          hint={rest
            .map(
              (file) => `${file.path}: ${reasons.get(file.path) ?? 'changed since the grouping'}`,
            )
            .join('\n')}
          files={rest}
          rows={rows}
        />
      ) : null}
      <Missing missing={result.missing} />
      <p className="px-2 pt-1 text-xs text-zinc-500">
        Grouped by {grouping.sourceLabel}
        {grouping.finishedAt ? `, ${new Date(grouping.finishedAt).toLocaleString()}` : ''}
        {grouping.outdated ? (
          <span className="text-amber-700 dark:text-amber-400">
            {' '}
            · outdated: the change moved since (Group by spec again)
          </span>
        ) : null}
      </p>
    </div>
  );
}
