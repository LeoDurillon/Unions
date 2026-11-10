// Brings a preview's services up (`compose up --build`), its output streamed to the ticket's log.
import { sharedPart, workspaceSubpaths, type ComposeJson } from '@union/core';

import { compose, createMountFolders } from './compose';
import { findDataFolders } from './data-folders';
import { outputLog } from './output-log';
import { createSharedData } from './shared-data';
import { joinShared } from './shared-stack';
import { lastLines, PreviewError, projectDirectory, type PreviewDeps, type Target } from './target';
import { unionEnvFile } from './variables';

/** `compose up` of the file to run with `flags`, its output in the ticket's log. */
async function composeUp(
  deps: PreviewDeps,
  target: Target,
  file: ComposeJson,
  flags: string[],
): Promise<void> {
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
      ...flags,
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

/**
 * Brings the services up from the file to run; a start's signal stops the build. With shared
 * services, its networks and containers are made first, the shared services join them, then it starts:
 * a service finds them from its first line.
 */
export async function up(deps: PreviewDeps, target: Target, file: ComposeJson): Promise<void> {
  await createMountFolders(
    deps.runtime,
    deps.settings,
    target.workspaceVolume,
    workspaceSubpaths(file),
  );
  if (sharedPart(file) === null) {
    await composeUp(deps, target, file, ['-d', '--build']);
  } else {
    await composeUp(deps, target, file, ['--no-start', '--build']);
    await joinShared(deps, target, file);
    await createSharedData(deps, target, file);
    await composeUp(deps, target, file, ['-d']);
  }
  await findDataFolders(deps, target, file);
}
