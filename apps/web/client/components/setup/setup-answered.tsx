// The Project setup card once the agent answered: what is left to apply, Review the setup, and its raw answer.

import type { SetupProposal, SetupView } from '@union/core';
import { pendingSections } from '@union/core/setup-apply';
import { useState, type ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { openInvestigation } from '../../lib/investigations/opened-investigation';
import { Button } from '../ui/ui';
import { SetupReview } from './setup-review';

function leftText(left: number): string {
  if (left === 0) {
    return 'Its proposed settings are all in the project now.';
  }
  return left === 1
    ? '1 part of it is not applied yet.'
    : `${left} parts of it are not applied yet.`;
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
  const [open, setOpen] = useState(false);
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
            setOpen(true);
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
      {open ? (
        <SetupReview
          project={project}
          setup={setup}
          proposal={proposal}
          onClose={() => {
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
