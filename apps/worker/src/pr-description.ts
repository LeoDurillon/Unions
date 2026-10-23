// Asks the implementer for a pull request's description (from the repository's template, if any)
// and reads it back.
import {
  type ContainerRuntime,
  type Db,
  effortFor,
  modelFor,
  resolveAgent,
  toolsFor,
} from '@union/core';

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

/** How to write it: the repository's template, else a plain summary. */
export function templateInstructions(template: Template | null): string {
  return template
    ? `Fill in the repository's pull request template (\`${template.path}\`), below. Keep its structure and headings, and write in the language the template is written in. Tick a checklist item only when it is true; leave the others unticked.\n\n\`\`\`markdown\n${template.text}\n\`\`\``
    : 'The repository has no pull request template. Write a short summary of the change, then the main changes, then how it was tested, in the language the ticket is written in.';
}

const OPEN_MARK = '<pr-description>';
const CLOSE_MARK = '</pr-description>';

/** The answer is parsed: only what sits between the marks becomes the description. */
export const OUTPUT_RULES = `Your answer is read by a program. Put the description, in markdown, between a line \`${OPEN_MARK}\` and a line \`${CLOSE_MARK}\`: everything outside them is dropped, so write no note, summary or remark for the user, inside or outside. Do not add a "Closes" line or link the ticket: that is added for you.`;

/** Asks the implementer, who knows the work, for the pull request's description. */
export function descriptionPrompt(template: Template | null, guidance = ''): string {
  const intro = guidance === '' ? '' : `${guidance}\n\n`;
  return `# Pull request description\n\n${intro}The pull request for your work is being opened. Write its description.\n\n${templateInstructions(template)}\n\n${OUTPUT_RULES}`;
}

/** Asks for the description again, from the one on GitHub, once the work changed after the PR was opened. */
export function rewritePrompt(input: {
  guidance: string;
  template: Template | null;
  current: string;
  base: string;
  ticket: { title: string; body: string };
}): string {
  const current = input.current.trim() === '' ? '(empty)' : input.current;
  return `# Pull request description, rewritten

${input.guidance}

The pull request is open, and its description below was written earlier. The branch changed since (reviews, revisions, rebases), so parts of it may be wrong or missing. Rewrite it to describe the branch as it is now. Compare it with its base with \`git diff ${input.base}...HEAD\` and \`git log ${input.base}..HEAD\`, one git command per call: no \`&&\`, no \`cd\`. Do not change any file.

Keep what is still true, including anything a person added by hand. Fix what is no longer true, and add what is missing.

${templateInstructions(input.template)}

## The ticket

# ${input.ticket.title}

${input.ticket.body}

## The current description

\`\`\`markdown
${current}
\`\`\`

${OUTPUT_RULES}`;
}

const FENCED = /^```(?:markdown|md)?\n(?<inner>[\s\S]*)\n```$/u;

/** The agent's answer, without the code fence some answers wrap the whole description in. */
function unfence(text: string): string {
  const trimmed = text.trim();
  return FENCED.exec(trimmed)?.groups?.inner?.trim() ?? trimmed;
}

/**
 * The description in the agent's answer: what its last pair of marks holds, so a remark before or
 * after is dropped; the whole answer when it has no marks. Unfenced either way.
 */
export function descriptionOf(answer: string): string {
  const end = answer.lastIndexOf(CLOSE_MARK);
  const start = end === -1 ? -1 : answer.lastIndexOf(OPEN_MARK, end);
  return unfence(start === -1 ? answer : answer.slice(start + OPEN_MARK.length, end));
}

/** The agent's description in the describer's session, or null when the turn fails or says nothing. */
export async function askDescription(
  runtime: ContainerRuntime,
  container: string,
  describer: Describer,
  prompt: string,
): Promise<string | null> {
  const outcome = await describer.agent(runtime, {
    container,
    cwd: REPO_DIR,
    model: modelFor(describer.db, 'pr_description'),
    effort: effortFor(describer.db, 'pr_description'),
    prompt,
    // Reading only: the work is pushed already.
    tools: toolsFor(describer.db, 'pr_description'),
    denied: IMPLEMENT_DENIED,
    resumeSessionId: describer.sessionId,
    signal: describer.signal,
    onEvent: describer.log,
  });
  const text = outcome.kind === 'ok' ? descriptionOf(outcome.text) : '';
  return text === '' ? null : text;
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
    const guidance = resolveAgent(describer.db, 'pr_description').prompt;
    return await askDescription(
      runtime,
      container,
      describer,
      descriptionPrompt(template, guidance),
    );
  } catch (error) {
    describer.log({ type: 'union_pr_description_failed', error: String(error) });
    return null;
  }
}
