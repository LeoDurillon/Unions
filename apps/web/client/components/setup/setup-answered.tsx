// The Project setup card once the agent answered: what is left to apply, Review the setup, and its raw answer.

import type { ProjectConfig, SetupProposal, SetupView } from '@union/core';
import { pendingSections } from '@union/core/setup-apply';
import { useState, type ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { openInvestigation } from '../../lib/investigations/opened-investigation';
import { plural } from '../../lib/ui/plural';
import { Button } from '../ui/ui';
import { SetupReview } from './setup-review';

function leftText(left: number): string {
  if (left === 0) {
    return 'Its proposed settings are all in the project now.';
  }
  return `${plural(left, 'part')} of it ${left === 1 ? 'is' : 'are'} not applied yet.`;
}

export function SetupAnswered({
  project,
  setup,
  proposal,
}: {
  project: PublicProject;
  setup: SetupView;
  proposal: SetupProposal;
}): ReactElement {
  const { investigation } = setup;
  // The settings when the review opened: what it leaves out as already applied.
  const [openedWith, setOpenedWith] = useState<ProjectConfig | null>(null);
  const left = pendingSections(proposal, project.config).length;
  return (
    <>
      <p>
        The setup agent has a proposal: {proposal.summary} {leftText(left)}
      </p>
      <div className="flex gap-2 pt-1">
        <Button
          variant="primary"
          onClick={() => {
            setOpenedWith(project.config);
          }}
        >
          Review the setup
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            openInvestigation(investigation.id);
          }}
        >
          Read its answer
        </Button>
      </div>
      {openedWith ? (
        <SetupReview
          project={project}
          openedWith={openedWith}
          setup={setup}
          proposal={proposal}
          onClose={() => {
            setOpenedWith(null);
          }}
        />
      ) : null}
    </>
  );
}
