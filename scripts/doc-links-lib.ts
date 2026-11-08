// Finds the relative links of a markdown file and which of them point at no file: the doc-link check's pure part.

/** `[text](target)` and `![alt](target)`; the target up to a space, `)` or `#`. */
const LINK = /!?\[[^\]]*\]\((?<target>[^)\s#]+)(?:#[^)\s]*)?(?:\s+"[^"]*")?\)/gu;
const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/iu;
const FENCE = /^\s*(?:```|~~~)/u;

/** The text outside fenced code blocks: a link written as an example there is not one. */
function outsideCode(markdown: string): string {
  let inCode = false;
  return markdown
    .split('\n')
    .map((line) => {
      if (FENCE.test(line)) {
        inCode = !inCode;
        return '';
      }
      return inCode ? '' : line.replaceAll(/`[^`]*`/gu, '');
    })
    .join('\n');
}

/** A source file named by its repository path, in prose or code: `apps/worker/src/agent/agent.ts`. */
const SOURCE_PATH = /\b(?:apps|packages|scripts)\/[\w./-]+\.tsx?\b/gu;

/** The repository paths of source files a text names. */
export function sourcePaths(markdown: string): string[] {
  return [...new Set(markdown.match(SOURCE_PATH))];
}

/** The relative link targets of a markdown text, without anchors; external and anchor-only links left out. */
export function relativeLinks(markdown: string): string[] {
  const targets: string[] = [];
  for (const match of outsideCode(markdown).matchAll(LINK)) {
    const target = match.groups?.target ?? '';
    if (target !== '' && !EXTERNAL.test(target)) {
      targets.push(decodeURI(target));
    }
  }
  return targets;
}
