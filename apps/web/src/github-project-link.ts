// Connecting a project to a GitHub Project, or disconnecting it: the columns the worker's board sync reads.
import { schema, type Db, type Project } from '@union/core';
import { eq } from 'drizzle-orm';

/**
 * Points the project at another board, or at none. Its tickets' items and synced columns belong to
 * the board they were on, so they are cleared: the worker adds each ticket to the new board. A
 * Project needs issues, so connecting one turns mirroring on and it stays on after a disconnect.
 */
export function setGitHubProject(
  db: Db,
  project: Project,
  board: { nodeId: string; url: string } | null,
): Project {
  return db.transaction((tx) => {
    if (board?.nodeId !== project.githubProjectNodeId) {
      tx.update(schema.tickets)
        .set({ projectItemId: null, githubSyncedStatus: null })
        .where(eq(schema.tickets.projectId, project.id))
        .run();
    }
    return tx
      .update(schema.projects)
      .set({
        githubProjectNodeId: board?.nodeId ?? '',
        githubProjectUrl: board?.url ?? null,
        statusFieldId: null,
        config: board ? { ...project.config, mirrorIssues: true } : project.config,
      })
      .where(eq(schema.projects.id, project.id))
      .returning()
      .get();
  });
}
