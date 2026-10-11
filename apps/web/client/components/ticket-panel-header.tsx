import type { ReactElement } from 'react';

import type { TicketDetail } from '../../src/api-types';
import { describePhase } from '../lib/labels';
import { Badge, Button } from './ui';

export function TicketPanelHeader({
  detail,
  onReview,
  onClose,
}: {
  detail: TicketDetail | undefined;
  onReview: () => void;
  onClose: () => void;
}): ReactElement {
  const phase = detail ? describePhase(detail.ticket.phase) : null;
  return (
    <header className="flex items-start justify-between gap-3 border-b border-zinc-200 p-4 dark:border-zinc-800">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{detail?.ticket.title ?? 'Loading…'}</h2>
        {phase ? <Badge tone={phase.tone}>{phase.label}</Badge> : null}
      </div>
      <div className="flex gap-2">
        {detail?.ticket.branch ? <Button onClick={onReview}>Review changes</Button> : null}
        <Button onClick={onClose}>Close</Button>
      </div>
    </header>
  );
}
