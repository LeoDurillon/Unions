// The setup agent's proposal to review: summary and questions, a card per section to apply, the
// tickets it asks for. Sections the settings already hold when it opens are only named.

import type { ProjectConfig, SetupProposal, SetupView } from '@union/core';
import { unappliedProposal, type SetupSection } from '@union/core/setup-apply';
import type { ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { useSetupDismissed } from '../../lib/setup/use-setup-dismissed';
import { plural } from '../../lib/ui/plural';
import { Dialog } from '../ui/dialog';
import { QuestionsCard, TicketsCard } from './setup-agent-cards';
import type { SetupCardProps } from './setup-card-props';
import { SetupCards } from './setup-cards';

const CREATED = 'ticket:';

const SECTION_LABELS: Record<SetupSection, string> = {
  checks: 'Checks',
  scripts: 'Saved scripts',
  preview: 'Preview',
  e2e: 'End-to-end tests',
  instructions: 'Project instructions',
};

/** The summary, what Union left out, and the sections already in the settings. */
function ReviewHeader({
  proposal,
  matching,
}: {
  proposal: SetupProposal;
  matching: readonly SetupSection[];
}): ReactElement {
  return (
    <>
      <div className="space-y-1">
        <p className="text-[15px] leading-relaxed">{proposal.summary}</p>
        <p className="text-sm text-zinc-500">
          Nothing is applied until you click Apply on a card. Edit a value first if you want.
        </p>
        {matching.length > 0 ? (
          <p className="text-sm text-zinc-500">
            Already in your settings, so not shown:{' '}
            {matching.map((section) => SECTION_LABELS[section]).join(', ')}.
          </p>
        ) : null}
      </div>
      <Dropped dropped={proposal.dropped} />
    </>
  );
}

function Dropped({ dropped }: { dropped: readonly string[] }): ReactElement | null {
  if (dropped.length === 0) {
    return null;
  }
  return (
    <details className="text-xs text-zinc-500">
      <summary className="cursor-pointer">
        Left out: {plural(dropped.length, 'value')} Union would refuse
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
  openedWith,
  setup,
  proposal,
  onClose,
}: {
  project: PublicProject;
  /** The settings when the review opened. */
  openedWith: ProjectConfig;
  setup: SetupView;
  proposal: SetupProposal;
  onClose: () => void;
}): ReactElement {
  const { investigation } = setup;
  const [keys, toggle] = useSetupDismissed(investigation.id);
  // From the settings as they were when it opened: a card applied meanwhile stays, with its badge.
  const { proposal: shown, matching } = unappliedProposal(proposal, openedWith);
  const cardOf = (key: string): SetupCardProps => ({
    project,
    investigation,
    proposal: shown,
    checkResults: setup.checks,
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
      <ReviewHeader proposal={proposal} matching={matching} />
      {proposal.questions.length > 0 ? (
        <QuestionsCard
          investigation={investigation}
          questions={proposal.questions}
          onAsked={onClose}
        />
      ) : null}
      <SetupCards cardOf={cardOf} proposal={shown} agentImageProblem={setup.agentImageProblem} />
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
