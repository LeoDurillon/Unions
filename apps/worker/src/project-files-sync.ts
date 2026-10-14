import {
  listProjectFiles,
  projectFileHostPath,
  type ContainerRuntime,
  type Db,
  type ProjectFile,
} from '@union/core';

import { previewSettings } from './preview/compose';

/** Where the volume is mounted in the helpers; the repository is under it, as in the workspace. */
const VOLUME = '/volume';
const REPO = `${VOLUME}/repo`;
/** The paths put in the repository last time, kept in `.git` so a fresh clone starts over. */
const MANIFEST = '.git/union-project-files';
const AGENT_USER = '1000:1000';

/**
 * Which workspace, through which image: one that runs as root, with a shell (the compose helper,
 * by default).
 */
export type WorkspaceVolume = { volume: string; image?: string };
type Helper = { volume: string; image: string };

/** Paths are checked on upload (plain names joined by `/`): quoting them is enough. */
function quoted(value: string): string {
  return `'${value}'`;
}

async function script(target: Helper, runtime: ContainerRuntime, body: string): Promise<string[]> {
  const lines: string[] = [];
  const stream = runtime.runHelper({
    image: target.image,
    mounts: [{ source: target.volume, target: VOLUME }],
    command: ['sh', '-c', `set -e\n${body}`],
  });
  let next = await stream.next();
  while (next.done !== true) {
    lines.push(next.value);
    // oxlint-disable-next-line no-await-in-loop -- reading one stream in order
    next = await stream.next();
  }
  if (next.value.exitCode !== 0) {
    throw new Error(
      `Could not put the project files in the workspace: ${lines.join('\n') || next.value.stderr}`,
    );
  }
  return lines;
}

/** What the workspace holds: the paths synced last time, and the sha256 of each file there now. */
async function inspect(
  target: Helper,
  runtime: ContainerRuntime,
  files: ProjectFile[],
): Promise<{ repo: boolean; synced: string[]; held: Map<string, string> }> {
  const checks = files.map(
    ({ path }) => `if [ -f ${quoted(path)} ]; then echo "HAS $(sha256sum ${quoted(path)})"; fi`,
  );
  const lines = await script(
    target,
    runtime,
    [
      `[ -d ${REPO}/.git ] || { echo NOREPO; exit 0; }`,
      `cd ${REPO}`,
      `if [ -f ${MANIFEST} ]; then sed 's/^/OLD /' ${MANIFEST}; fi`,
      ...checks,
    ].join('\n'),
  );
  const held = new Map<string, string>();
  for (const line of lines.filter((item) => item.startsWith('HAS '))) {
    const [sha256 = '', path = ''] = line.slice('HAS '.length).split(/\s+/u);
    held.set(path, sha256);
  }
  return {
    repo: !lines.includes('NOREPO'),
    synced: lines
      .filter((line) => line.startsWith('OLD '))
      .map((line) => line.slice('OLD '.length)),
    held,
  };
}

/** Each folder above `path`, outermost first: `a`, `a/b` for `a/b/c.sql`. */
function folders(path: string): string[] {
  const parts = path.split('/').slice(0, -1);
  return parts.map((_part, index) => parts.slice(0, index + 1).join('/'));
}

/** Removes what is no longer a project file and makes the folders the new ones go in. */
function prepareScript(removed: string[], copied: ProjectFile[]): string {
  const made = [...new Set(copied.flatMap((file) => folders(file.path)))];
  return [
    `cd ${REPO}`,
    ...removed.map((path) => `rm -f ${quoted(path)}`),
    ...removed.map((path) => `sed -i '\\|^/${path}$|d' .git/info/exclude 2>/dev/null || true`),
    ...made.map(
      (dir) =>
        `[ -d ${quoted(dir)} ] || { mkdir ${quoted(dir)}; chown ${AGENT_USER} ${quoted(dir)}; }`,
    ),
    ...copied.map(
      ({ path }) =>
        `if [ -d ${quoted(path)} ]; then echo "${path} is a folder in the repository"; exit 1; fi`,
    ),
  ].join('\n');
}

/** Hands the copies to the agent's user, keeps every project file out of git, and notes them. */
function finishScript(files: ProjectFile[], copied: ProjectFile[]): string {
  return [
    `cd ${REPO}`,
    ...copied.map(({ path }) => `chown ${AGENT_USER} ${quoted(path)} && chmod 644 ${quoted(path)}`),
    'mkdir -p .git/info && touch .git/info/exclude',
    ...files.map(
      ({ path }) =>
        `grep -qxF ${quoted(`/${path}`)} .git/info/exclude || echo ${quoted(`/${path}`)} >> .git/info/exclude`,
    ),
    files.length === 0
      ? `rm -f ${MANIFEST}`
      : `printf '%s\\n' ${files.map(({ path }) => quoted(path)).join(' ')} > ${MANIFEST}`,
  ].join('\n');
}

/**
 * Puts the project's files in a ticket's workspace, at their paths in the repository: new or
 * changed ones are copied (a file already there with the same content is left alone), removed ones
 * disappear, and git never sees any of them (`.git/info/exclude`).
 */
export async function syncProjectFiles(
  db: Db,
  runtime: ContainerRuntime,
  projectId: number,
  workspace: WorkspaceVolume,
): Promise<void> {
  const target = { volume: workspace.volume, image: workspace.image ?? previewSettings().image };
  const files = listProjectFiles(db, projectId);
  const state = await inspect(target, runtime, files);
  if (!state.repo) {
    return;
  }
  const wanted = new Set(files.map((file) => file.path));
  const removed = state.synced.filter((path) => !wanted.has(path));
  const copied = files.filter((file) => state.held.get(file.path) !== file.sha256);
  const listed =
    state.synced.length === files.length && state.synced.every((path) => wanted.has(path));
  if (removed.length === 0 && copied.length === 0 && listed) {
    return;
  }
  await script(target, runtime, prepareScript(removed, copied));
  if (copied.length > 0) {
    await runtime.copyIntoVolume(
      target.volume,
      target.image,
      copied.map((file) => ({
        hostPath: projectFileHostPath(file),
        volumePath: `repo/${file.path}`,
      })),
    );
  }
  await script(target, runtime, finishScript(files, copied));
}
