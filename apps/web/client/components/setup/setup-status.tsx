// The setup agent's run above a project's board: reading the repository, its proposal, or why it failed.
import { useQuery } from '@tanstack/react-query';
import type { Investigation, SetupView } from '@union/core';
import type { ReactElement, ReactNode } from 'react';

import { openInvestigation } from '../../lib/opened-investigation';
import { setupApi } from '../../lib/setup-api';
import { Button } from '../ui';
import { SetupStart } from './setup-start';

function Open({
  investigation,
  label,
}: {
  investigation: Investigation;
  label: string;
}): ReactElement {
  return (
    <Button
      size="sm"
      onClick={() => {
        openInvestigation(investigation.id);
      }}
    >
      {label}
    </Button>
  );
}

/** What the card says, from the run's state. */
function body({ investigation, proposal }: SetupView): ReactNode {
  const { status } = investigation;
  if (status === 'queued' || status === 'running') {
    return (
      <>
        <p>The setup agent is reading the repository.</p>
        <Open investigation={investigation} label="Follow its log" />
      </>
    );
  }
  if (status === 'succeeded') {
    return (
      <>
        <p>
          {proposal
            ? `The setup agent has a proposal: ${proposal.summary}`
            : 'The setup agent answered without a proposal Union can read.'}
        </p>
        <Open investigation={investigation} label="Read its answer" />
      </>
    );
  }
  return (
    <>
      <p>
        {status === 'failed'
          ? `The setup agent failed: ${investigation.error ?? 'no reason given'}`
          : 'The setup run was cancelled.'}
      </p>
      <SetupStart projectId={investigation.projectId} model={investigation.model} />
    </>
  );
}

/** Nothing when the project never had a setup run. */
export function SetupStatus({ projectId }: { projectId: number }): ReactElement | null {
  const setup = useQuery({
    queryKey: ['investigations', 'setup', projectId],
    queryFn: () => setupApi.latest(projectId),
  });
  if (!setup.data) {
    return null;
  }
  return (
    <section
      aria-label="Project setup"
      className="mx-4 mt-3 space-y-2 rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800"
    >
      <h2 className="font-semibold">Project setup</h2>
      {body(setup.data)}
    </section>
  );
}
