// Checks of a setup proposal the worker runs without Claude: queued, claimed, moved through their stages, and read back.

import { and, asc, desc, eq } from 'drizzle-orm';

import type { Db } from '../db';
import * as schema from '../schema/schema';
import {
  setupChecks,
  type SetupCheckInput,
  type SetupCheckKind,
  type SetupCheckStage,
} from '../schema/schema-setup-checks';
import { emitEvent } from '../ticket/tickets';
import { previewAfter } from './setup-apply';
import { parseSetupProposal } from './setup-proposal';

export type { SetupCheckInput } from '../schema/schema-setup-checks';

export type SetupCheck = typeof setupChecks.$inferSelect;

type Executor = Db | Parameters<Parameters<Db['transaction']>[0]>[0];

/** The latest check of each kind: the one the cards show. */
export type SetupCheckResults = { checks: SetupCheck | null; preview: SetupCheck | null };

export type SetupCheckOutcome = {
  status: 'passed' | 'failed' | 'timed_out';
  output: string;
};

function changed(db: Executor, check: SetupCheck): void {
  emitEvent(db, {
    type: 'setup_check_changed',
    investigationId: check.investigationId,
    payload: { checkId: check.id, kind: check.kind, status: check.status, stage: check.stage },
  });
}

/**
 * Queues a check of these values. One still waiting of the same kind takes the new values instead:
 * only the latest values are worth checking.
 */
export function queueSetupCheck(
  db: Db,
  investigationId: number,
  input: SetupCheckInput,
): SetupCheck {
  return db.transaction((tx) => {
    const waiting = tx
      .select({ id: setupChecks.id })
      .from(setupChecks)
      .where(
        and(
          eq(setupChecks.investigationId, investigationId),
          eq(setupChecks.kind, input.kind),
          eq(setupChecks.status, 'queued'),
        ),
      )
      .get();
    const check = waiting
      ? tx
          .update(setupChecks)
          .set({ input })
          .where(eq(setupChecks.id, waiting.id))
          .returning()
          .get()
      : tx
          .insert(setupChecks)
          .values({ investigationId, kind: input.kind, input })
          .returning()
          .get();
    changed(tx, check);
    return check;
  });
}

/** What a proposal's checks test: its commands, when it gives any. */
function checksInput(installCommand: string, gateCommand: string): SetupCheckInput | null {
  return installCommand.trim() === '' && gateCommand.trim() === ''
    ? null
    : { kind: 'checks', installCommand, gateCommand };
}

/**
 * Queues the checks of a setup run's answer: its commands, and its preview as Apply would save it.
 * Nothing for another kind of run, a run that did not succeed, or an answer Union cannot read.
 */
export function queueProposalChecks(db: Db, investigationId: number): SetupCheck[] {
  const investigation = db
    .select()
    .from(schema.investigations)
    .where(eq(schema.investigations.id, investigationId))
    .get();
  if (investigation?.kind !== 'setup' || investigation.status !== 'succeeded') {
    return [];
  }
  const proposal = parseSetupProposal(investigation.result ?? '');
  const project = db
    .select({ config: schema.projects.config })
    .from(schema.projects)
    .where(eq(schema.projects.id, investigation.projectId))
    .get();
  if (!proposal || !project) {
    return [];
  }
  const inputs: SetupCheckInput[] = [];
  const checks = proposal.checks
    ? checksInput(proposal.checks.installCommand, proposal.checks.gateCommand)
    : null;
  if (checks) {
    inputs.push(checks);
  }
  if (proposal.preview) {
    inputs.push({
      kind: 'preview',
      preview: previewAfter(project.config.preview, proposal.preview),
    });
  }
  return inputs.map((input) => queueSetupCheck(db, investigationId, input));
}

/** The oldest waiting check, now running. */
export function claimSetupCheck(db: Db): SetupCheck | null {
  return db.transaction((tx) => {
    const next = tx
      .select()
      .from(setupChecks)
      .where(eq(setupChecks.status, 'queued'))
      .orderBy(asc(setupChecks.id))
      .get();
    if (!next) {
      return null;
    }
    const check = tx
      .update(setupChecks)
      .set({ status: 'running', startedAt: Date.now(), stage: 'cloning' })
      .where(eq(setupChecks.id, next.id))
      .returning()
      .get();
    changed(tx, check);
    return check;
  });
}

export function setSetupCheckStage(db: Db, id: number, stage: SetupCheckStage): void {
  const [check] = db
    .update(setupChecks)
    .set({ stage })
    .where(and(eq(setupChecks.id, id), eq(setupChecks.status, 'running')))
    .returning()
    .all();
  if (check) {
    changed(db, check);
  }
}

/** Records how it ended; the stage stays where it stopped. */
export function finishSetupCheck(db: Db, id: number, outcome: SetupCheckOutcome): void {
  const [check] = db
    .update(setupChecks)
    .set({ ...outcome, finishedAt: Date.now() })
    .where(eq(setupChecks.id, id))
    .returning()
    .all();
  if (check) {
    changed(db, check);
  }
}

/** Fails the checks a stopped worker left running; returns their ids, for their containers. */
export function recoverSetupChecks(db: Db): number[] {
  const stuck = db.select().from(setupChecks).where(eq(setupChecks.status, 'running')).all();
  for (const check of stuck) {
    finishSetupCheck(db, check.id, {
      status: 'failed',
      output: 'The worker stopped during the check: test it again.',
    });
  }
  return stuck.map((check) => check.id);
}

function latestOf(db: Db, investigationId: number, kind: SetupCheckKind): SetupCheck | null {
  return (
    db
      .select()
      .from(setupChecks)
      .where(and(eq(setupChecks.investigationId, investigationId), eq(setupChecks.kind, kind)))
      .orderBy(desc(setupChecks.id))
      .limit(1)
      .get() ?? null
  );
}

export function latestSetupChecks(db: Db, investigationId: number): SetupCheckResults {
  return {
    checks: latestOf(db, investigationId, 'checks'),
    preview: latestOf(db, investigationId, 'preview'),
  };
}
