// What `bun run map` writes: one line per source file, its own summary, grouped by folder.
import path from 'node:path';

/** A part of the repository with a map of its own (`docs/map/<name>.md`). */
export type MapArea = { name: string; root: string };

export const MAP_AREAS: MapArea[] = [
  { name: 'core', root: 'packages/core/src' },
  { name: 'web-server', root: 'apps/web/src' },
  { name: 'web-client', root: 'apps/web/client' },
  { name: 'worker', root: 'apps/worker/src' },
  { name: 'scripts', root: 'scripts' },
];

const MAX_SUMMARY = 160;
const LINT_COMMENT = /^\/\/\s*oxlint-/u;

function clean(lines: string[]): string {
  return lines
    .map((line) =>
      line
        .replace(/^\s*\/\*\*?/u, '')
        .replace(/\*\/\s*$/u, '')
        .replace(/^\s*\*\s?/u, '')
        .replace(/^\s*\/\/\s?/u, ''),
    )
    .join(' ')
    .replaceAll(/\s+/gu, ' ')
    .trim();
}

/** The first sentence, short enough for one line. */
function firstSentence(text: string): string {
  const end = text.search(/[.!?](?:\s|$)/u);
  const sentence = end === -1 ? text : text.slice(0, end + 1);
  return sentence.length > MAX_SUMMARY ? `${sentence.slice(0, MAX_SUMMARY - 1)}…` : sentence;
}

/** The comment at the top of the file, before any code: `//` lines or one block. */
function headerComment(lines: string[]): string[] | null {
  const start = lines.findIndex((line) => line.trim() !== '' && !LINT_COMMENT.test(line.trim()));
  const first = lines[start]?.trim() ?? '';
  if (first.startsWith('//')) {
    const end = lines.findIndex((line, at) => at > start && !line.trim().startsWith('//'));
    return lines.slice(start, end === -1 ? undefined : end);
  }
  if (first.startsWith('/*')) {
    const end = lines.findIndex((line, at) => at >= start && line.includes('*/'));
    const after = lines[end + 1]?.trim() ?? '';
    // A block right above an export documents that export, not the file: the fallback reads it.
    return after.startsWith('export') ? null : lines.slice(start, end + 1);
  }
  return null;
}

const DECLARATION =
  /^export (?:default )?(?:async )?(?<kind>function|class|const|let|type|interface|enum) (?<name>\w+)/u;
const TYPE_KINDS = new Set(['type', 'interface', 'enum']);

/** `container-run.ts` → `containerrun`: compared with export names, case and dashes aside. */
function plainName(file: string): string {
  return path.posix
    .basename(file)
    .replace(/\.tsx?$/u, '')
    .replaceAll('-', '')
    .toLowerCase();
}

/** How well an export speaks for its file: named after it, then a function or component, else not. */
function rank(kind: string, name: string, file: string): number {
  if (
    name.toLowerCase().includes(plainName(file)) ||
    plainName(file).includes(name.toLowerCase())
  ) {
    return 2;
  }
  return kind === 'function' || kind === 'class' || /^[A-Z][a-z]/u.test(name) ? 1 : 0;
}

/** Where the doc comment ending on the line above `at` starts. */
function commentStart(lines: string[], at: number): number {
  let start = at - 1;
  while (start > 0 && !(lines[start]?.trim().startsWith('/*') ?? false)) {
    start -= 1;
  }
  return start;
}

/** A documented export at `at`: its doc comment and how well it speaks for the file. */
function documentedExport(
  lines: string[],
  at: number,
  file: string,
): { score: number; comment: string[] } | null {
  const groups = DECLARATION.exec(lines[at]?.trim() ?? '')?.groups;
  if (!groups || !(lines[at - 1]?.trim().endsWith('*/') ?? false)) {
    return null;
  }
  const kind = groups.kind ?? '';
  const score = TYPE_KINDS.has(kind) ? -1 : rank(kind, groups.name ?? '', file);
  return { score, comment: lines.slice(commentStart(lines, at), at) };
}

/** The doc comment of the export that best speaks for the file (constants and types last). */
function exportComment(lines: string[], file: string): string[] | null {
  let best: { score: number; comment: string[] } | null = null;
  for (let at = 1; at < lines.length; at += 1) {
    const found = documentedExport(lines, at, file);
    if (found && (!best || found.score > best.score)) {
      best = found;
    }
  }
  return best?.comment ?? null;
}

/** A file's summary: its header comment, else its first documented export's; null without either. */
export function summaryOf(source: string, file = ''): string | null {
  const lines = source.split('\n');
  const comment = headerComment(lines) ?? exportComment(lines, file);
  const text = comment ? clean(comment) : '';
  return text === '' ? null : firstSentence(text);
}

/** The map of one area, from its files' paths and sources. */
export function renderMap(area: MapArea, files: { file: string; source: string }[]): string {
  const folders = new Map<string, string[]>();
  for (const { file, source } of files.toSorted((a, b) => a.file.localeCompare(b.file))) {
    const relative = path.posix.relative(area.root, file);
    const folder = path.posix.dirname(relative);
    const entry = `- \`${path.posix.basename(relative)}\`: ${summaryOf(source, file) ?? '(no summary)'}`;
    folders.set(folder, [...(folders.get(folder) ?? []), entry]);
  }
  const sections = [...folders].map(
    ([folder, entries]) => `## ${folder === '.' ? './' : `${folder}/`}\n\n${entries.join('\n')}\n`,
  );
  return `# Map: \`${area.root}\`\n\nGenerated by \`bun run map\` from each file's top comment (else its first documented\nexport); do not edit. Tests are left out.\n\n${sections.join('\n')}`;
}
