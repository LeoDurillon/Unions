// How far the reviewer got through the change: "12 of 300 files viewed" with a bar, from the files marked viewed.

import type { ReactElement } from 'react';

import type { DiffFileSummary } from '../../../src/api-types';
import { useViewed } from './viewed-context';

const PERCENT = 100;

/** Nothing until the change has files. */
export function ReviewProgress({ files }: { files: DiffFileSummary[] }): ReactElement | null {
  const viewed = useViewed();
  if (files.length === 0) {
    return null;
  }
  const done = viewed.count(files);
  return (
    <div
      className="flex w-40 shrink-0 flex-col gap-1 max-lg:hidden"
      title="Mark a file viewed with its checkbox, or v on the open file"
    >
      <span className="text-[11.5px] text-zinc-500">
        <strong className="font-semibold text-zinc-900 dark:text-zinc-100">{done}</strong> of{' '}
        {files.length} files viewed
      </span>
      <span className="h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <span
          className="block h-full rounded-full bg-indigo-500"
          style={{ width: `${Math.round((done / files.length) * PERCENT)}%` }}
        />
      </span>
    </div>
  );
}
