// The folders a preview's services keep data in inside the checkout: the repository folders they mount
// that git ignores whole. Found at each start; a reset empties the ones the user chose.
import {
  getPreview,
  recordDataFolders,
  workspaceSubpaths,
  type ComposeJson,
  type WorkspaceOwner,
} from '@union/core';

import { PreviewError, type PreviewDeps, type Target } from './target';
import { workspaceScript } from './workspace-script';

/** A folder is offered when git ignores it and tracks nothing in it: emptying it loses no code. */
const IGNORED = [
  'cd /workspace/repo || exit 1',
  'for dir; do',
  '  [ -d "$dir" ] || continue',
  `  git -c safe.directory='*' check-ignore -q -- "$dir/" || continue`,
  `  [ -z "$(git -c safe.directory='*' ls-files -- "$dir" | head -n 1)" ] && echo "$dir"`,
  'done',
  'exit 0',
].join('\n');

const EMPTY = [
  'cd /workspace/repo || exit 1',
  'for dir; do find "./$dir" -mindepth 1 -delete || exit 1; done',
].join('\n');

const REPO_PREFIX = 'repo/';

/** The repository's folders a file mounts, relative to it (`data`); the whole repository is not one. */
export function mountedFolders(file: ComposeJson): string[] {
  return workspaceSubpaths(file)
    .filter((subpath) => subpath.startsWith(REPO_PREFIX))
    .map((subpath) => subpath.slice(REPO_PREFIX.length))
    .filter((folder) => folder !== '' && !folder.split('/').includes('..'));
}

/** Records the mounted folders git ignores whole; best effort: a failure keeps the last ones found. */
export async function findDataFolders(
  deps: PreviewDeps,
  target: Target,
  file: ComposeJson,
): Promise<void> {
  const candidates = mountedFolders(file);
  try {
    const run =
      candidates.length === 0
        ? { exitCode: 0, output: [] }
        : await workspaceScript(deps.runtime, {
            image: deps.settings.image,
            volume: target.workspaceVolume,
            script: IGNORED,
            args: candidates,
          });
    if (run.exitCode === 0) {
      const found = run.output.filter((line) => candidates.includes(line));
      recordDataFolders(deps.db, target.owner, found);
    }
  } catch {
    // The preview runs whatever this finds.
  }
}

/** Empties the chosen folders among the ones found at the last start; says which it emptied. */
export async function emptyDataFolders(
  deps: PreviewDeps,
  target: { owner: WorkspaceOwner; workspaceVolume: string },
  folders: string[],
): Promise<string[]> {
  const known = getPreview(deps.db, target.owner)?.dataFolders ?? [];
  const chosen = folders.filter((folder) => known.includes(folder));
  if (chosen.length === 0) {
    return [];
  }
  const run = await workspaceScript(deps.runtime, {
    image: deps.settings.image,
    volume: target.workspaceVolume,
    script: EMPTY,
    args: chosen,
  });
  if (run.exitCode !== 0) {
    throw new PreviewError(`Could not empty ${chosen.join(', ')}:\n${run.output.join('\n')}`);
  }
  return chosen;
}
