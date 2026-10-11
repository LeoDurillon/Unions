import type { ReactElement } from 'react';

import { parseVerdict } from '../lib/verdict';
import { Badge } from './ui';

/** The reviewer's verdict at the top of the final review. */
export function VerdictBadge({ review }: { review: string }): ReactElement {
  const verdict = parseVerdict(review);
  if (verdict === 'approved') {
    return <Badge tone="green">Reviewer: approved</Badge>;
  }
  if (verdict === 'changes_requested') {
    return <Badge tone="red">Reviewer: changes requested</Badge>;
  }
  return <Badge tone="neutral">Reviewer gave no verdict</Badge>;
}
