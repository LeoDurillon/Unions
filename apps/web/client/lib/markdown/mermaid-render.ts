// Draws Mermaid source as SVG, for the screen (in its color scheme) or for a file (light, with plain-text labels).
export type DiagramUse = 'screen' | 'export';

const DARK = '(prefers-color-scheme: dark)';

/** `initialize` is global: renders run one at a time so each gets its own settings. */
let queue: Promise<void> = Promise.resolve();

async function draw(id: string, source: string, use: DiagramUse): Promise<string> {
  // Mermaid is large: loaded on the first diagram, then shared by all of them.
  const { default: mermaid } = await import('mermaid');
  const dark = use === 'screen' && globalThis.matchMedia(DARK).matches;
  // A canvas refuses to export an image holding HTML labels: files get SVG text instead.
  const htmlLabels = use === 'screen';
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    // A broken diagram shows its source in the page; Mermaid would add its own error to the page's end.
    suppressErrorRendering: true,
    theme: dark ? 'dark' : 'default',
    htmlLabels,
  });
  const { svg } = await mermaid.render(id, source);
  return svg;
}

/** The SVG of `source`; `id` must be unique in the page and usable in a CSS selector. */
export async function renderMermaid(id: string, source: string, use: DiagramUse): Promise<string> {
  const previous = queue;
  const turn = Promise.withResolvers<void>();
  queue = turn.promise;
  await previous;
  try {
    return await draw(id, source, use);
  } finally {
    turn.resolve();
  }
}
