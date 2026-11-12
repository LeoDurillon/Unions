// The Usage page's title, what it counts, and the range of days it shows.

import type { ReactElement } from 'react';

import type { UsageRange } from '../../lib/usage/use-usage';
import { Segmented, type SegmentOption } from '../ui/choice';

const RANGES: SegmentOption<UsageRange>[] = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: 'all', label: 'All' },
];

export function UsageHeader({
  range,
  onRange,
}: {
  range: UsageRange;
  onRange: (range: UsageRange) => void;
}): ReactElement {
  return (
    <header className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Usage</h2>
        <p className="text-xs text-zinc-500">
          What this project&apos;s agents used: its tickets and investigations. The cost is what
          these tokens would cost on the API; a Max subscription is not billed per call.
        </p>
      </div>
      <Segmented legend="Range" options={RANGES} value={range} onChange={onRange} />
    </header>
  );
}
