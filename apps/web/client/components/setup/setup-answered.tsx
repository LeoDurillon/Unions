// The Project setup card once the agent answered: what is left to apply, Review the setup, and its raw answer.
import type { Investigation, SetupProposal } from '@union/core';
import { pendingSections } from '@union/core/setup-apply';
import { useState, type ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { openInvestigation } from '../../lib/opened-investigation';
import { Button } from '../ui';
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
  investigation,
  proposal,
}: {
  project: PublicProject;
  investigation: Investigation;
  proposal: SetupProposal;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const left = pendingSections(proposal, project.config).length;
  return (
    <>
      <p>
        The setup agent has a proposal: {proposal.summary} {leftText(left)}
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="primary"
          onClick={() => {
            setOpen(true);
          }}
        >
          Review the setup
        </Button>
        <Button
          size="sm"
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
          investigation={investigation}
          proposal={proposal}
          onClose={() => {
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
