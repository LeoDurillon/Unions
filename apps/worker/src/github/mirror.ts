// Runs one `GitHubSync` per project, each with the project's own credentials.
import { emitEvent, schema, type Db } from '@union/core';

import type { GitHubApi } from './api';
import { GitHubSync } from './sync';

type Project = typeof schema.projects.$inferSelect;
type Entry = { api: GitHubApi; sync: GitHubSync };

/** Runs one `GitHubSync` per project, each with the project's own credentials. */
export class GitHubMirror {
  private readonly entries = new Map<number, Entry>();
  private readonly reportedMissing = new Set<number>();

  constructor(
    private readonly db: Db,
    private readonly apiFor: (project: Project) => GitHubApi | null,
  ) {}

  async push(): Promise<void> {
    for (const sync of this.syncs()) {
      await sync.push();
    }
  }

  async pull(): Promise<void> {
    for (const sync of this.syncs()) {
      await sync.pull();
    }
  }

  private syncs(): GitHubSync[] {
    const result: GitHubSync[] = [];
    for (const project of this.db.select().from(schema.projects).all()) {
      const api = this.apiFor(project);
      if (api) {
        result.push(this.syncFor(project.id, api));
      } else {
        this.reportMissingToken(project);
      }
    }
    return result;
  }

  private syncFor(projectId: number, api: GitHubApi): GitHubSync {
    const existing = this.entries.get(projectId);
    if (existing?.api === api) {
      return existing.sync;
    }
    const sync = new GitHubSync(this.db, api, projectId);
    this.entries.set(projectId, { api, sync });
    return sync;
  }

  private reportMissingToken(project: Project): void {
    if (this.reportedMissing.has(project.id)) {
      return;
    }
    this.reportedMissing.add(project.id);
    emitEvent(this.db, {
      type: 'github_sync_error',
      payload: {
        error: `Project ${project.owner}/${project.repo} has no GitHub credentials (token or GitHub App installation)`,
      },
    });
  }
}
