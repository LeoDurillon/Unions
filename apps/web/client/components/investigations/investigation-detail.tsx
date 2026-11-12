// One investigation: its header, the ticket being written from it (or the form asking what it covers), then its
// tabs: the conversation with the follow-up box, the agent's live log, and what its agent calls used.
import type { Investigation } from '@union/core';
import { useState, type ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { creatingKinds } from '../../lib/integrations-api';
import { InvestigationHeader } from './investigation-header';
import { InvestigationTabs } from './investigation-tabs';
import { InvestigationTicket } from './investigation-ticket';

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
  const [asking, setAsking] = useState(false);
  return (
    <article className="min-h-full bg-zinc-50/60 dark:bg-zinc-950">
      <div className="bg-white dark:bg-zinc-950">
        <InvestigationHeader
          investigation={investigation}
          onDeleted={onDeleted}
          onAskTicket={
            asking
              ? null
              : () => {
                  setAsking(true);
                }
          }
          onOpenTicket={onOpenTicket}
        />
        <div className="px-8 empty:hidden [&:not(:empty)]:pb-4">
          <InvestigationTicket
            investigation={investigation}
            targets={creatingKinds(project)}
            asking={asking}
            onClose={() => {
              setAsking(false);
            }}
          />
        </div>
      </div>
      <InvestigationTabs investigation={investigation} />
    </article>
  );
}
