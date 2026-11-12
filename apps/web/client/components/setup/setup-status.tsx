// The setup agent's run above a project's board: reading the repository, its proposal, or why it failed.

import { useQuery } from '@tanstack/react-query';
import type { Investigation, SetupView } from '@union/core';
import type { ReactElement, ReactNode } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { openInvestigation } from '../../lib/investigations/opened-investigation';
import { setupApi } from '../../lib/setup/setup-api';
import { Button } from '../ui/ui';
import { SetupAnswered } from './setup-answered';
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
function body({ investigation, proposal }: SetupView, project: PublicProject): ReactNode {
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
    return proposal ? (
      <SetupAnswered project={project} investigation={investigation} proposal={proposal} />
    ) : (
      <>
        <p>The setup agent answered without a proposal Union can read.</p>
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
export function SetupStatus({ project }: { project: PublicProject }): ReactElement | null {
  const projectId = project.id;
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
      className="mx-4 mt-3 space-y-2 rounded-xl border border-zinc-200 bg-white p-4 text-sm shadow-xs dark:border-zinc-800 dark:bg-zinc-900"
    >
      <h2 className="text-[15px] font-semibold">Project setup</h2>
      {body(setup.data, project)}
    </section>
  );
}
