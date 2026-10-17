// What the user gave the implementer's next run: command outputs and CI outputs, read together and marked read together.
import { and, asc, eq, inArray } from 'drizzle-orm';

import type { CiOutput } from './ci-outputs';
import { markSentToAgent, pendingForAgent, type ContainerRun } from './container-runs';
import type { Db } from './db';
import { ciOutputs } from './schema-ci-outputs';

export type AgentInputs = { commands: ContainerRun[]; ci: CiOutput[] };

/** Everything waiting for the implementer's next run, oldest first in each list. */
export function pendingAgentInputs(db: Db, ticketId: number): AgentInputs {
  const ci = db
    .select()
    .from(ciOutputs)
    .where(and(eq(ciOutputs.ticketId, ticketId), eq(ciOutputs.forAgent, 'next_run')))
    .orderBy(asc(ciOutputs.id))
    .all();
  return { commands: pendingForAgent(db, ticketId), ci };
}

/** The implementer read them: they are not given again. */
export function markAgentInputsSent(db: Db, inputs: AgentInputs): void {
  db.transaction((tx) => {
    markSentToAgent(
      tx,
      inputs.commands.map((run) => run.id),
    );
    const ids = inputs.ci.map((output) => output.id);
    if (ids.length > 0) {
      tx.update(ciOutputs).set({ forAgent: 'sent' }).where(inArray(ciOutputs.id, ids)).run();
    }
  });
}
