// A slice's CI in one word (failed, running, passed), its counts by state on hover.
import type { ReactElement } from 'react';

import type { CheckCounts } from '../../../src/ci-api-types';

function describe(counts: CheckCounts): string {
  const parts = (['failed', 'pending', 'passed', 'skipped'] as const)
    .filter((state) => counts[state] > 0)
    .map((state) => `${counts[state]} ${state}`);
  return parts.length === 0 ? 'No checks' : parts.join(', ');
}

function verdict(counts: CheckCounts): { text: string; className: string } {
  if (counts.failed > 0) {
    return { text: `✗ ${counts.failed} failed`, className: 'text-red-700 dark:text-red-400' };
  }
  if (counts.pending > 0) {
    return { text: '● running', className: 'text-amber-700 dark:text-amber-400' };
  }
  if (counts.passed > 0) {
    return { text: '✓ passed', className: 'text-green-700 dark:text-green-400' };
  }
  return { text: 'no checks', className: 'text-zinc-500' };
}

/** `undefined`: not read (a merged slice, or still reading); null: GitHub has no such pull request. */
export function SliceCi({ counts }: { counts: CheckCounts | null | undefined }): ReactElement {
  if (counts === undefined) {
    return <span />;
  }
  if (counts === null) {
    return (
      <span className="text-xs text-zinc-400" title="GitHub has no such pull request">
        —
      </span>
    );
  }
  const { text, className } = verdict(counts);
  return (
    <span className={`truncate text-xs ${className}`} title={describe(counts)}>
      {text}
    </span>
  );
}
