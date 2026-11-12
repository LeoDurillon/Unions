// The size of the ticket's change in its details: lines of code added against the plan's estimate, the files on hover.

import { describeSize } from '@union/core/change-budget';
import type { ReactElement } from 'react';

import type { TicketSize } from '../../../src/api-size-types';
import { DetailRow } from '../ui/detail-row';

const HINT =
  'Lines of code the change adds; tests, lock files, migrations and docs are counted apart (Project settings → Change size)';
const MAX_FILES = 20;

function filesTitle(size: TicketSize): string {
  return size.codeFiles
    .slice(0, MAX_FILES)
    .map((file) => `+${file.additions}  ${file.path}`)
    .join('\n');
}

export function SizeRow({ size }: { size: TicketSize | null }): ReactElement | null {
  if (size === null) {
    return null;
  }
  const over = size.budget !== null && size.code > size.budget.lines;
  return (
    <DetailRow label="Size" hint={HINT}>
      <span className={over ? 'text-amber-700 dark:text-amber-400' : ''} title={filesTitle(size)}>
        {describeSize(size, size.budget)}
      </span>
      {size.trimmedFrom === null ? null : (
        <span className="ml-2 text-xs text-zinc-500">
          cut from {size.trimmedFrom} by the trim pass
        </span>
      )}
    </DetailRow>
  );
}
