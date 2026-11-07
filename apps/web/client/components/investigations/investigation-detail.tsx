// One investigation: its questions, the latest answer, the agent's live log and a follow-up form.
import type { Investigation } from '@union/core';
import type { ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { creatingKinds } from '../../lib/integrations-api';
import { MODEL_LABELS } from '../agents/agent-labels';
import { Badge } from '../ui';
import { Actions } from './investigation-actions';
import { SCOPE_LABELS, STATUS_LABELS } from './investigation-labels';
import { InvestigationTabs } from './investigation-tabs';
import { EarlierExchanges, LatestQuestion, NextSteps } from './investigation-thread';

/** One investigation: its questions, the latest answer, the agent's live log and a follow-up form. */
export function InvestigationDetail({
  investigation,
  project,
  onDeleted,
  onOpenTicket,
}: {
  investigation: Investigation;
  /** Its project: the ticket can be created in one of its trackers too. */
  project: PublicProject;
  onDeleted: () => void;
  onOpenTicket: (id: number) => void;
}): ReactElement {
  const status = STATUS_LABELS[investigation.status];
  return (
    <article className="space-y-4">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold">{investigation.title}</h3>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
        <p className="text-xs text-zinc-500">
          {SCOPE_LABELS[investigation.scope].title} · {MODEL_LABELS[investigation.model]} ·{' '}
          {investigation.tools.join(', ')}
        </p>
        <Actions investigation={investigation} onDeleted={onDeleted} />
      </header>
      <EarlierExchanges investigation={investigation} />
      <LatestQuestion investigation={investigation} />
      <InvestigationTabs investigation={investigation} />
      {investigation.status === 'succeeded' ? (
        <NextSteps
          investigation={investigation}
          targets={creatingKinds(project)}
          onOpenTicket={onOpenTicket}
        />
      ) : null}
    </article>
  );
}
