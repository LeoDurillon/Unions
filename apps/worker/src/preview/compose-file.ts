import {
  composeProblems,
  exposedServiceProblem,
  getPreview,
  isRecord,
  previewCompose,
  previewHost,
  saveGeneratedCompose,
  tidyCompose,
  withWorkspaceMounts,
  type ComposeJson,
} from '@union/core';

import { compose } from './compose';
import {
  lastLines,
  loadTarget,
  PreviewError,
  projectDirectory,
  type PreviewDeps,
  type Target,
} from './target';

const TRAILING_SPACES = / +$/gmu;

function toYaml(file: ComposeJson): string {
  return Bun.YAML.stringify(file, null, 2).replace(TRAILING_SPACES, '');
}

/**
 * A compose file as Docker resolves it (`config --format json`), from the repository (`file`) or
 * given on stdin (`yaml`), with the project's variables for its `${VAR}`.
 */
async function resolve(
  deps: PreviewDeps,
  target: Target,
  source: { file: string } | { yaml: string },
): Promise<ComposeJson> {
  const output = await compose(deps.runtime, deps.settings, {
    args:
      'file' in source
        ? ['-p', target.project, '-f', source.file, 'config', '--format', 'json']
        : [
            '-p',
            target.project,
            '--project-directory',
            projectDirectory(target),
            '-f',
            '-',
            'config',
            '--format',
            'json',
          ],
    workspaceVolume: target.workspaceVolume,
    stdin: 'yaml' in source ? source.yaml : undefined,
    env: target.config.env,
  });
  if (output.exitCode !== 0) {
    throw new PreviewError(`The compose file could not be read:\n${lastLines(output.tail)}`);
  }
  try {
    const parsed: unknown = JSON.parse(output.tail.join('\n'));
    if (isRecord(parsed)) {
      return parsed;
    }
  } catch {
    // Reported below.
  }
  throw new PreviewError('docker compose config did not print a compose file');
}

function refuse(problems: string[], whose: string): void {
  if (problems.length > 0) {
    throw new PreviewError(`${whose} cannot run as a preview:\n- ${problems.join('\n- ')}`);
  }
}

/** The file Union writes from the repository's compose file, after the checks; kept for the panel. */
export async function generatedFile(deps: PreviewDeps, target: Target): Promise<ComposeJson> {
  try {
    const resolved = await resolve(deps, target, { file: target.config.composeFile });
    const exposed = exposedServiceProblem(resolved, target.config.service);
    refuse([...composeProblems(resolved), ...(exposed ? [exposed] : [])], 'The compose file');
    const file = tidyCompose(
      previewCompose(resolved, {
        project: target.project,
        workspaceVolume: target.workspaceVolume,
        host: previewHost(target.ticketId),
        service: target.config.service,
        port: target.config.port,
        env: target.config.env,
      }),
    );
    saveGeneratedCompose(deps.db, target.ticketId, { yaml: toYaml(file) });
    return file;
  } catch (error) {
    saveGeneratedCompose(deps.db, target.ticketId, {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * The user's own file for the ticket, resolved and checked like the generated one. Union keeps its
 * project name (isolation, Stop) and the workspace mounts; the rest is the user's, host ports included.
 */
async function ownFile(deps: PreviewDeps, target: Target, yaml: string): Promise<ComposeJson> {
  const resolved = await resolve(deps, target, { yaml });
  const file = { ...withWorkspaceMounts(resolved, target.workspaceVolume), name: target.project };
  refuse(composeProblems(file, { workspaceVolume: target.workspaceVolume }), 'Your compose file');
  return file;
}

/** What Start runs: the user's file when the ticket has one, else a freshly generated one. */
export function fileToRun(deps: PreviewDeps, target: Target): Promise<ComposeJson> {
  const override = getPreview(deps.db, target.ticketId)?.override;
  return override ? ownFile(deps, target, override) : generatedFile(deps, target);
}

/** The ticket's preview target; null when it has none (the reason is saved for the panel). */
function targetOrReason(deps: PreviewDeps, ticketId: number): Target | null {
  try {
    return loadTarget(deps, ticketId);
  } catch (error) {
    saveGeneratedCompose(deps.db, ticketId, {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/** Generates the file without starting anything, for the panel to show (the reason, if refused). */
export async function generatePreviewFile(deps: PreviewDeps, ticketId: number): Promise<void> {
  const target = targetOrReason(deps, ticketId);
  if (!target) {
    return;
  }
  try {
    await generatedFile(deps, target);
  } catch {
    // Saved with the file by `generatedFile`.
  }
}
