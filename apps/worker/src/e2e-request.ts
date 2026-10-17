// The e2e tests the user asks for, from a ticket or a pull request, in its own container.
import {
  getTicket,
  hasActiveContainerRun,
  recordE2e,
  schema,
  type Db,
  type PreviewConfig,
  type WorkspaceOwner,
} from '@union/core';
import { eq } from 'drizzle-orm';

import { runE2e, type E2eResult } from './e2e';
import type { PreviewDeps } from './preview/run';
import { ensureTicketContainer, type ProvisionConfig } from './provision';
import { loadReview, openReviewContainer } from './review-checkout';

function previewConfigOf(db: Db, owner: WorkspaceOwner): PreviewConfig | undefined {
  const projectId =
    'ticketId' in owner
      ? getTicket(db, owner.ticketId).projectId
      : loadReview(db, owner.reviewId).projectId;
  return db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).get()?.config
    .preview;
}

/** The owner's container, started for the run, and what to do once it ends. */
async function openContainer(
  deps: PreviewDeps & { config: ProvisionConfig },
  owner: WorkspaceOwner,
): Promise<{ name: string; close: () => Promise<void> }> {
  const { db, runtime } = deps;
  if ('reviewId' in owner) {
    const name = await openReviewContainer(deps, owner.reviewId);
    return {
      name,
      // A command may run there meanwhile: the container stays up for it.
      close: async () => {
        if (!hasActiveContainerRun(db, owner)) {
          await runtime.stop(name);
        }
      },
    };
  }
  const ticket = getTicket(db, owner.ticketId);
  const { name } = await ensureTicketContainer(db, runtime, deps.config, ticket);
  return {
    name,
    // A step the user started meanwhile works in the same container: it stops it itself.
    close: async () => {
      if (getTicket(db, owner.ticketId).phase.kind !== 'running') {
        await runtime.stop(name);
      }
    },
  };
}

function recorded(result: E2eResult | null): Parameters<typeof recordE2e>[2] {
  return result === null || result.status === 'skipped'
    ? { e2eStatus: 'skipped', e2eOutput: result?.reason ?? 'Nothing to run' }
    : {
        e2eStatus: result.status,
        e2eOutput: result.tail,
        e2eExitCode: result.exitCode,
        e2eScreenshots: result.screenshots,
      };
}

/**
 * The e2e run the user asked for, from a ticket or a pull request: in the owner's container
 * (started for it, and stopped after unless something else runs there), against its preview. The
 * result is kept on the preview for the panel; for a ticket, the user decides whether to send a
 * failure to the agent.
 */
export async function runRequestedE2e(
  deps: PreviewDeps & { config: ProvisionConfig },
  owner: WorkspaceOwner,
): Promise<void> {
  const { db, runtime } = deps;
  recordE2e(db, owner, { e2eStatus: 'running' });
  let close: (() => Promise<void>) | null = null;
  try {
    const preview = previewConfigOf(db, owner);
    if (!preview?.e2eCommand) {
      recordE2e(db, owner, { e2eStatus: 'skipped', e2eOutput: 'The project has no e2e command' });
      return;
    }
    const opened = await openContainer(deps, owner);
    ({ close } = opened);
    const result = await runE2e({
      db,
      runtime,
      owner,
      container: opened.name,
      preview,
      previewOverrides: deps,
    });
    recordE2e(db, owner, recorded(result));
  } catch (error) {
    recordE2e(db, owner, {
      e2eStatus: 'skipped',
      e2eOutput: error instanceof Error ? error.message : String(error),
    });
  } finally {
    await close?.().catch(() => null);
  }
}
