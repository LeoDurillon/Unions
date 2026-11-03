// An investigation as a Markdown file: its settings, then every question and its answer, oldest first.
import type { Investigation } from '@union/core';

import { MODEL_LABELS } from '../agents/agent-labels';
import { SCOPE_LABELS, STATUS_LABELS } from './investigation-labels';

type Exchange = { prompt: string; answer: string };

/** File names stay short: the title is cut after this many characters. */
const MAX_SLUG = 60;
const ISO_DATE_LENGTH = 10;

/** What stands in for the latest answer while there is none. */
function pendingAnswer(investigation: Investigation): string {
  if (investigation.error !== null) {
    return `_The run failed:_\n\n\`\`\`\n${investigation.error}\n\`\`\``;
  }
  return `_No answer yet (${STATUS_LABELS[investigation.status].label})._`;
}

function exchanges(investigation: Investigation): Exchange[] {
  const latest = {
    prompt: investigation.prompt,
    answer: investigation.result ?? pendingAnswer(investigation),
  };
  return [...investigation.history, latest];
}

function day(ms: number): string {
  return new Date(ms).toISOString().slice(0, ISO_DATE_LENGTH);
}

function details(investigation: Investigation): string[] {
  const tools = investigation.tools.length === 0 ? 'none' : investigation.tools.join(', ');
  return [
    `- Scope: ${SCOPE_LABELS[investigation.scope].title}`,
    `- Model: ${MODEL_LABELS[investigation.model]}`,
    `- Tools: ${tools}`,
    `- Status: ${STATUS_LABELS[investigation.status].label}`,
    `- Asked: ${day(investigation.createdAt)}`,
  ];
}

/** The whole investigation in Markdown: a numbered heading per question and per answer. */
export function investigationMarkdown(investigation: Investigation): string {
  const all = exchanges(investigation);
  const numbered = all.length > 1;
  const sections = all.flatMap((exchange, index) => {
    const suffix = numbered ? ` ${index + 1}` : '';
    return [
      `## Question${suffix}`,
      exchange.prompt.trim(),
      `## Answer${suffix}`,
      exchange.answer.trim(),
    ];
  });
  return `${[`# ${investigation.title}`, details(investigation).join('\n'), ...sections].join('\n\n')}\n`;
}

/** `investigation-<id>-<title in kebab case>.md`. */
export function investigationFileName(investigation: Investigation): string {
  const slug = investigation.title
    .normalize('NFKD')
    .replaceAll(/[̀-ͯ]/gu, '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, '-')
    .slice(0, MAX_SLUG)
    .replaceAll(/^-+|-+$/gu, '');
  return slug === ''
    ? `investigation-${investigation.id}.md`
    : `investigation-${investigation.id}-${slug}.md`;
}
