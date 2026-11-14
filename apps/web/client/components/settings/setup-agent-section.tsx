// Project settings → General: the setup agent's last run, and Run setup again with the model to use.
// Its proposal shows above the board, where it is reviewed.

import { useQuery } from '@tanstack/react-query';
import type { SetupView } from '@union/core';
import { SETUP_DEFAULT_MODEL } from '@union/core/investigation-defaults';
import type { ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { setupApi } from '../../lib/setup/setup-api';
import { SetupStart } from '../setup/setup-start';

const LAST_RUN: Record<SetupView['investigation']['status'], (error: string | null) => string> = {
  queued: () =>
    'The setup agent is waiting for a run slot: its proposal will show above the board.',
  running: () =>
    'The setup agent is reading the repository: its proposal will show above the board.',
  succeeded: () =>
    'Its last proposal is above the board: Review the setup there. A new run replaces it.',
  failed: (error) => `Its last run failed: ${error ?? 'no reason given'}`,
  cancelled: () => 'Its last run was cancelled.',
};

/** What the last run did, in one sentence. */
function lastRun(setup: SetupView | null): string {
  if (!setup) {
    return 'The setup agent has not run on this project yet.';
  }
  return LAST_RUN[setup.investigation.status](setup.investigation.error);
}

function busy(setup: SetupView | null): boolean {
  const status = setup?.investigation.status;
  return status === 'queued' || status === 'running';
}

export function SetupAgentSection({ project }: { project: PublicProject }): ReactElement {
  const setup = useQuery({
    queryKey: ['investigations', 'setup', project.id],
    queryFn: () => setupApi.latest(project.id),
  });
  const view = setup.data ?? null;
  return (
    <section aria-label="Setup agent" className="space-y-2">
      <h3 className="text-sm font-semibold">Setup agent</h3>
      <p className="text-xs text-zinc-500">
        An agent reads the repository and proposes the checks, preview, e2e command, scripts,
        instructions and agent image; Union tests them, and you apply what you want. Run it for a
        project set up before it existed, after the repository changed, or when a run failed. Its
        review shows only what differs from your settings.
      </p>
      <p className="text-sm">{lastRun(view)}</p>
      {setup.isPending || busy(view) ? null : (
        <SetupStart
          projectId={project.id}
          model={view?.investigation.model ?? SETUP_DEFAULT_MODEL}
        />
      )}
    </section>
  );
}
