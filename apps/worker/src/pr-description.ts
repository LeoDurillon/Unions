import { type ContainerRuntime, type Db, effortFor, modelFor, toolsFor } from '@union/core';

import type { AgentFn } from './agent';
import { runIn } from './container-exec';
import { IMPLEMENT_DENIED } from './implement-loop';
import { REPO_DIR } from './provision';

/** Where GitHub looks for a pull request template, in its order; the names are case-insensitive. */
const TEMPLATE_FILES = [
  '.github/pull_request_template.md',
  'pull_request_template.md',
  'docs/pull_request_template.md',
];
/** With several templates in this folder GitHub asks which; the first by name is used. */
const TEMPLATE_DIR = '.github/pull_request_template/';
/** A template longer than this is cut: it is a form to fill in, not a document. */
const MAX_TEMPLATE_CHARS = 20_000;

export type Template = { path: string; text: string };

/** What the description turn needs: the implementer's session to resume, and where it logs. */
export type Describer = {
  db: Db;
  agent: AgentFn;
  sessionId: string | null;
  signal: AbortSignal;
  log: (event: unknown) => void;
};

/** `find` prints `./a/b`; the template lists `a/b`. */
function relative(path: string): string {
  return path.replace(/^\.\//u, '');
}

/** The template GitHub would use among the repository's files (paths relative to its root). */
export function pickTemplate(paths: string[]): string | null {
  const files = paths.map((path) => relative(path));
  for (const file of TEMPLATE_FILES) {
    const found = files.find((path) => path.toLowerCase() === file);
    if (found) {
      return found;
    }
  }
  const inFolder = files
    .filter(
      (path) => path.toLowerCase().startsWith(TEMPLATE_DIR) && path.toLowerCase().endsWith('.md'),
    )
    .toSorted();
  return inFolder[0] ?? null;
}

export async function findTemplate(
  runtime: ContainerRuntime,
  container: string,
): Promise<Template | null> {
  const listed = await runIn(runtime, container, [
    'sh',
    '-c',
    `cd ${REPO_DIR} && find . -maxdepth 3 -type f -ipath '*pull_request_template*'`,
  ]);
  const path = pickTemplate(listed.stdout.split('\n').filter((line) => line.trim() !== ''));
  if (!path) {
    return null;
  }
  const read = await runIn(runtime, container, ['cat', `${REPO_DIR}/${path}`]);
  return read.exitCode === 0 ? { path, text: read.stdout.slice(0, MAX_TEMPLATE_CHARS) } : null;
}

/** Asks the implementer, who knows the work, for the pull request's description. */
export function descriptionPrompt(template: Template | null): string {
  const how = template
    ? `Fill in the repository's pull request template (\`${template.path}\`), below. Keep its structure and headings, and write in the language the template is written in. Tick a checklist item only when it is true; leave the others unticked.\n\n\`\`\`markdown\n${template.text}\n\`\`\``
    : 'The repository has no pull request template. Write a short summary of the change, then the main changes, then how it was tested, in the language the ticket is written in.';
  return `# Pull request description\n\nThe pull request for your work is being opened. Write its description.\n\n${how}\n\nOutput only the description in markdown, with no preamble. Do not add a "Closes" line or link the ticket: that is added for you.`;
}

/** The description for a new pull request, or null to keep the default body when the turn fails. */
export async function writeDescription(
  runtime: ContainerRuntime,
  container: string,
  describer: Describer,
): Promise<string | null> {
  try {
    const template = await findTemplate(runtime, container);
    describer.log({ type: 'union_pr_description', template: template?.path ?? null });
    const outcome = await describer.agent(runtime, {
      container,
      cwd: REPO_DIR,
      model: modelFor(describer.db, 'implement'),
      effort: effortFor(describer.db, 'implement'),
      prompt: descriptionPrompt(template),
      // Reading only: the work is pushed already.
      tools: toolsFor(describer.db, 'final_review'),
      denied: IMPLEMENT_DENIED,
      resumeSessionId: describer.sessionId,
      signal: describer.signal,
      onEvent: describer.log,
    });
    const text = outcome.kind === 'ok' ? outcome.text.trim() : '';
    return text === '' ? null : text;
  } catch (error) {
    describer.log({ type: 'union_pr_description_failed', error: String(error) });
    return null;
  }
}
