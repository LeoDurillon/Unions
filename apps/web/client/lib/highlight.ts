// Syntax highlighting for the review's diffs, with highlight.js.
import type { DiffLine } from '@union/core/diff';
import { common, createLowlight } from 'lowlight';

/**
 * One run of text in a highlighted line: `className` holds the highlight.js classes (if any), `start`
 * its column, which makes a stable key.
 */
export type Token = { text: string; className: string; start: number };

const lowlight = createLowlight(common);

type Tree = ReturnType<typeof lowlight.highlight>;
type Node = Tree['children'][number];
type ElementNode = Extract<Node, { type: 'element' }>;
type ChildNode = ElementNode['children'][number];

/** File names that say the language better than their extension. */
const BY_NAME: Record<string, string> = {
  dockerfile: 'dockerfile',
  makefile: 'makefile',
  'cmakelists.txt': 'cmake',
};

/** The highlight.js language for a path, from its name or extension; null when none fits. */
export function languageFor(path: string): string | null {
  const name = (path.split('/').at(-1) ?? '').toLowerCase();
  const byName = BY_NAME[name] ?? (name.startsWith('dockerfile') ? 'dockerfile' : undefined);
  if (byName !== undefined) {
    return byName;
  }
  const extension = name.includes('.') ? (name.split('.').at(-1) ?? '') : '';
  return extension !== '' && lowlight.registered(extension) ? extension : null;
}

function classesOf(node: ElementNode): string[] {
  const { className } = node.properties;
  return Array.isArray(className) ? className.map(String) : [];
}

/** Adds a run of text (no line break) to the end of the current line. */
function append(out: Token[][], text: string, classes: string[]): void {
  const line = out.at(-1);
  if (!line || text === '') {
    return;
  }
  const last = line.at(-1);
  const start = last ? last.start + last.text.length : 0;
  line.push({ text, className: classes.join(' '), start });
}

/** Adds text that may hold line breaks: each break starts a new line. */
function appendText(out: Token[][], value: string, classes: string[]): void {
  for (const [index, text] of value.split('\n').entries()) {
    if (index > 0) {
      out.push([]);
    }
    append(out, text, classes);
  }
}

/** Flattens the highlighted tree into lines of tokens, splitting runs that span line breaks. */
function collect(nodes: readonly (Node | ChildNode)[], classes: string[], out: Token[][]): void {
  for (const node of nodes) {
    if (node.type === 'text') {
      appendText(out, node.value, classes);
    } else if (node.type === 'element') {
      collect(node.children, [...classes, ...classesOf(node)], out);
    }
  }
}

/** Highlights a block of code and returns it line by line. */
export function tokenize(code: string, language: string): Token[][] {
  const out: Token[][] = [[]];
  collect(lowlight.highlight(language, code).children, [], out);
  return out;
}

/**
 * Tokens for every changed or context line of a patch. Each hunk is highlighted per side (old: context
 * and removed lines, new: context and added lines), so comments and strings over several lines colour
 * right. Empty when the language is unknown.
 */
export function highlightDiff(lines: DiffLine[], language: string | null): Map<DiffLine, Token[]> {
  const tokens = new Map<DiffLine, Token[]>();
  if (language === null) {
    return tokens;
  }
  const flush = (side: DiffLine[]): void => {
    const highlighted = tokenize(side.map((line) => line.text).join('\n'), language);
    for (const [index, line] of side.entries()) {
      tokens.set(line, highlighted[index] ?? []);
    }
  };
  let oldSide: DiffLine[] = [];
  let newSide: DiffLine[] = [];
  for (const line of [...lines, { kind: 'hunk', text: '' } as const]) {
    if (line.kind === 'hunk') {
      flush(oldSide);
      flush(newSide);
      oldSide = [];
      newSide = [];
    } else if (line.kind === 'del') {
      oldSide.push(line);
    } else if (line.kind === 'add') {
      newSide.push(line);
    } else if (line.kind === 'context') {
      // On both sides, so each keeps its parsing state; the new side's tokens are kept.
      oldSide.push(line);
      newSide.push(line);
    }
    // `meta` lines ("\ No newline at end of file") are not code.
  }
  return tokens;
}
