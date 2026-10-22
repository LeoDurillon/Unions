// A ```mermaid code block drawn as its diagram, with its export buttons; the source stays shown when it does not parse.
import { useEffect, useId, useState, type ReactElement } from 'react';

import { renderMermaid } from '../lib/mermaid-render';
import { DiagramActions } from './diagram-actions';

type Drawing = { svg: string } | { error: string } | null;

async function draw(id: string, source: string): Promise<Drawing> {
  try {
    return { svg: await renderMermaid(id, source, 'screen') };
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
    return (
      <div className="mermaid-diagram">
        <DiagramActions id={id} source={source} />
        {/* The SVG comes from Mermaid's strict mode, which strips scripts and event handlers. */}
        <div dangerouslySetInnerHTML={{ __html: drawing.svg }} />
      </div>
    );
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
