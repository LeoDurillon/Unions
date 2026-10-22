// A ```mermaid code block drawn as its diagram; the source stays shown when it does not parse.
import { useEffect, useId, useState, type ReactElement } from 'react';

type Drawing = { svg: string } | { error: string } | null;

const DARK = '(prefers-color-scheme: dark)';

/** Mermaid is large: loaded on the first diagram, then shared by all of them. */
async function draw(id: string, source: string): Promise<Drawing> {
  try {
    const { default: mermaid } = await import('mermaid');
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      // A broken diagram shows its source here; Mermaid would add its own error to the page's end.
      suppressErrorRendering: true,
      theme: globalThis.matchMedia(DARK).matches ? 'dark' : 'default',
    });
    const { svg } = await mermaid.render(id, source);
    return { svg };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export function MermaidDiagram({ source }: { source: string }): ReactElement {
  // Mermaid uses the id in CSS selectors: `useId`'s colons would break them.
  const id = `mermaid-${useId().replaceAll(/[^\w-]/gu, '')}`;
  const [drawing, setDrawing] = useState<Drawing>(null);
  useEffect(() => {
    let current = true;
    const show = async (): Promise<void> => {
      const result = await draw(id, source);
      if (current) {
        setDrawing(result);
      }
    };
    void show();
    return () => {
      current = false;
    };
  }, [id, source]);
  if (drawing && 'svg' in drawing) {
    // The SVG comes from Mermaid's strict mode, which strips scripts and event handlers.
    return <div className="mermaid-diagram" dangerouslySetInnerHTML={{ __html: drawing.svg }} />;
  }
  return (
    <div>
      {drawing && 'error' in drawing ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          This diagram could not be drawn: {drawing.error}
        </p>
      ) : null}
      <pre>
        <code className="language-mermaid">{source}</code>
      </pre>
    </div>
  );
}
