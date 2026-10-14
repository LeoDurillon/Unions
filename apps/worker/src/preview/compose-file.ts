import {
  composeProblems,
  envFileProblem,
  exposedServiceProblem,
  getPreview,
  isRecord,
  previewCompose,
  saveGeneratedCompose,
  composeServices,
  tidyCompose,
  withoutProfiles,
  withWorkspaceMounts,
  type ComposeJson,
} from '@union/core';

import { catalogSummary, profileArgs, profileHint, readCatalog, type Catalog } from './catalog';
import { compose, printedJson } from './compose';
import {
  lastLines,
  loadTarget,
  PreviewError,
  projectDirectory,
  type PreviewDeps,
  type Target,
} from './target';
import { configEnvironment, runVariables, shownVariables, unmaskSecrets } from './variables';

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
  env: Record<string, string>,
): Promise<ComposeJson> {
  const output = await compose(deps.runtime, deps.settings, {
    args:
      'file' in source
        ? [
            '-p',
            target.project,
            ...profileArgs(target),
            '-f',
            source.file,
            'config',
            '--format',
            'json',
          ]
        : [
            '-p',
            target.project,
            ...profileArgs(target),
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
    env,
    keepAll: true,
  });
  if (output.exitCode !== 0) {
    throw new PreviewError(`The compose file could not be read:\n${lastLines(output.tail)}`);
  }
  const parsed = printedJson(output.lines);
  if (isRecord(parsed)) {
    return parsed;
  }
  throw new PreviewError(
    `docker compose config did not print a compose file:
${lastLines(output.tail)}`,
  );
}

function refuse(problems: string[], heading: string): void {
  if (problems.length > 0) {
    throw new PreviewError(`${heading}:\n- ${problems.join('\n- ')}`);
  }
}

function exposedProblems(resolved: ComposeJson, target: Target, catalog: Catalog): string[] {
  return target.exposed.flatMap(({ service }) => {
    const problem = exposedServiceProblem(resolved, service);
    if (!problem) {
      return [];
    }
    return [
      composeServices(resolved).includes(service)
        ? problem
        : (profileHint(catalog, service) ?? problem),
    ];
  });
}

/** The file from the repository's: to run (`shown` false) or to show, secrets as references. */
async function buildFile(
  deps: PreviewDeps,
  target: Target,
  shown: boolean,
  catalog: Catalog,
): Promise<ComposeJson> {
  const resolved = await resolve(
    deps,
    target,
    { file: target.config.composeFile },
    configEnvironment(target, shown),
  );
  refuse(
    [...composeProblems(resolved), ...exposedProblems(resolved, target, catalog)],
    'The compose file cannot run as a preview',
  );
  const written = shown ? shownVariables(target) : runVariables(target);
  const { envFile } = target.config;
  const file = tidyCompose(
    previewCompose(resolved, {
      project: target.project,
      workspaceVolume: target.workspaceVolume,
      exposed: target.exposed,
      env: written.env,
      envFile: envFile ? { ...envFile, content: written.content } : undefined,
    }),
  );
  const envFileIssue = envFile ? envFileProblem(file, envFile) : null;
  refuse(envFileIssue ? [envFileIssue] : [], 'The variables cannot be given as a file');
  return file;
}

/**
 * The file Union writes from the repository's compose file, after the checks. The one kept for the
 * panel shows each secret as `${NAME}`: with secrets it is built a second time that way.
 */
export async function generatedFile(deps: PreviewDeps, target: Target): Promise<ComposeJson> {
  const catalog = await readCatalog(deps, target);
  const summary = catalogSummary(catalog);
  try {
    const file = await buildFile(deps, target, false, catalog);
    const names = Object.keys(target.secrets);
    const shown = names.length === 0 ? file : await buildFile(deps, target, true, catalog);
    saveGeneratedCompose(
      deps.db,
      target.ticketId,
      { yaml: unmaskSecrets(toYaml(shown), names) },
      summary,
    );
    return file;
  } catch (error) {
    saveGeneratedCompose(
      deps.db,
      target.ticketId,
      { error: error instanceof Error ? error.message : String(error) },
      summary,
    );
    throw error;
  }
}

/**
 * The user's own file for the ticket, resolved and checked like the generated one. Union keeps its
 * project name (isolation, Stop) and the workspace mounts; the rest is the user's, host ports included.
 */
async function ownFile(deps: PreviewDeps, target: Target, yaml: string): Promise<ComposeJson> {
  // Its secrets are `${NAME}` references: compose fills them in here.
  const resolved = await resolve(deps, target, { yaml }, configEnvironment(target, false));
  const file = {
    ...withoutProfiles(withWorkspaceMounts(resolved, target.workspaceVolume)),
    name: target.project,
  };
  refuse(
    composeProblems(file, { workspaceVolume: target.workspaceVolume }),
    'Your compose file cannot run as a preview',
  );
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
