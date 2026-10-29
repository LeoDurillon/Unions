// Brings a preview's services up (`compose up --build`), its output streamed to the ticket's log.
import {
  emitEvent,
  ticketOwnerId,
  workspaceSubpaths,
  type ComposeJson,
  type Db,
  type WorkspaceOwner,
} from '@union/core';

import { compose, createMountFolders } from './compose';
import { lastLines, PreviewError, projectDirectory, type PreviewDeps, type Target } from './target';
import { unionEnvFile } from './variables';

/** Output lines per `preview_output` event: a build prints thousands. */
const OUTPUT_BATCH = 25;

/** Sends the output to the ticket's log a batch at a time; a pull request's preview has no log. */
export function outputLog(
  db: Db,
  owner: WorkspaceOwner,
): { push: (line: string) => void; flush: () => void } {
  const ticketId = ticketOwnerId(owner);
  let lines: string[] = [];
  const flush = (): void => {
    if (ticketId !== null && lines.length > 0) {
      emitEvent(db, { type: 'preview_output', ticketId, payload: { lines } });
      lines = [];
    }
  };
  return {
    push: (line) => {
      if (ticketId === null) {
        return;
      }
      lines.push(line);
      if (lines.length >= OUTPUT_BATCH) {
        flush();
      }
    },
    flush,
  };
}

/** Brings the services up from the file to run; a start's signal stops the build. */
export async function up(deps: PreviewDeps, target: Target, file: ComposeJson): Promise<void> {
  await createMountFolders(
    deps.runtime,
    deps.settings,
    target.workspaceVolume,
    workspaceSubpaths(file),
  );
  const log = outputLog(deps.db, target.owner);
  const output = await compose(deps.runtime, deps.settings, {
    args: [
      '-p',
      target.project,
      '--project-directory',
      projectDirectory(target),
      '-f',
      '-',
      'up',
      '-d',
      '--build',
      '--remove-orphans',
    ],
    workspaceVolume: target.workspaceVolume,
    stdin: JSON.stringify(file),
    files: unionEnvFile(target),
    onLine: log.push,
    signal: deps.signal,
  });
  log.flush();
  if (output.exitCode !== 0) {
    throw new PreviewError(`docker compose up failed:\n${lastLines(output.tail)}`);
  }
}
