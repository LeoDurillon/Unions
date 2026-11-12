// The setup agent's proposal to review: summary and questions, a card per section to apply, the
// tickets it asks for.

import type { Investigation, SetupProposal } from '@union/core';
import type { ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { useSetupDismissed } from '../../lib/setup/use-setup-dismissed';
import { Dialog } from '../ui/ui';
import { QuestionsCard, TicketsCard } from './setup-agent-cards';
import type { SetupCardProps } from './setup-card-props';
import { SetupCards } from './setup-cards';

const CREATED = 'ticket:';

function Dropped({ dropped }: { dropped: readonly string[] }): ReactElement | null {
  if (dropped.length === 0) {
    return null;
  }
  return (
    <details className="text-xs text-zinc-500">
      <summary className="cursor-pointer">
        Left out: {dropped.length} values Union would refuse
      </summary>
      <ul className="mt-1 list-disc pl-5">
        {dropped.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </details>
  );
}

export function SetupReview({
  project,
  investigation,
  proposal,
  onClose,
}: {
  project: PublicProject;
  investigation: Investigation;
  proposal: SetupProposal;
  onClose: () => void;
}): ReactElement {
  const [keys, toggle] = useSetupDismissed(investigation.id);
  const cardOf = (key: string): SetupCardProps => ({
    project,
    proposal,
    dismissed: keys.includes(key),
    onDismiss: (dismissed) => {
      toggle(key, dismissed);
    },
  });
  const created = keys
    .filter((key) => key.startsWith(CREATED))
    .map((key) => Number(key.slice(CREATED.length)));
  return (
    <Dialog open wide title="Review the setup" onClose={onClose}>
      <div className="space-y-1">
        <p className="text-[15px] leading-relaxed">{proposal.summary}</p>
        <p className="text-sm text-zinc-500">
          Nothing is applied until you click Apply on a card. Edit a value first if you want.
        </p>
      </div>
      <Dropped dropped={proposal.dropped} />
      {proposal.questions.length > 0 ? (
        <QuestionsCard
          investigation={investigation}
          questions={proposal.questions}
          onAsked={onClose}
        />
      ) : null}
      <SetupCards cardOf={cardOf} proposal={proposal} />
      {proposal.tickets.length > 0 ? (
        <TicketsCard
          projectId={project.id}
          tickets={proposal.tickets}
          created={created}
          onCreated={(index) => {
            toggle(`${CREATED}${index}`, true);
          }}
        />
      ) : null}
    </Dialog>
  );
}
