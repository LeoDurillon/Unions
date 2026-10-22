// A diagram's buttons: download it as SVG or PNG (light, whatever the screen shows), or copy its Mermaid source.
import { useState, type ReactElement } from 'react';

import { download, pngBlob, standaloneSvg, svgSize } from '../lib/diagram-export';
import { renderMermaid } from '../lib/mermaid-render';

type Format = 'svg' | 'png';

const COPIED_MS = 1500;
const BUTTON =
  'rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800';

async function exportDiagram(id: string, source: string, format: Format): Promise<void> {
  const svg = await renderMermaid(`${id}-export`, source, 'export');
  const size = svgSize(svg);
  if (!size) {
    throw new Error('The diagram has no size');
  }
  const file = standaloneSvg(svg, size);
  const blob =
    format === 'svg' ? new Blob([file], { type: 'image/svg+xml' }) : await pngBlob(file, size);
  download(blob, `diagram.${format}`);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function DiagramActions({ id, source }: { id: string; source: string }): ReactElement {
  const [copied, setCopied] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const save = async (format: Format): Promise<void> => {
    setProblem(null);
    try {
      await exportDiagram(id, source, format);
    } catch (error) {
      setProblem(`Export failed: ${message(error)}`);
    }
  };
  const copy = async (): Promise<void> => {
    setProblem(null);
    try {
      await navigator.clipboard.writeText(source);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, COPIED_MS);
    } catch (error) {
      setProblem(`Copy failed: ${message(error)}`);
    }
  };
  return (
    <div className="diagram-actions flex items-center justify-end gap-1">
      {problem ? <span className="text-xs text-red-700 dark:text-red-400">{problem}</span> : null}
      <button type="button" className={BUTTON} onClick={() => void save('svg')}>
        SVG
      </button>
      <button type="button" className={BUTTON} onClick={() => void save('png')}>
        PNG
      </button>
      <button type="button" className={BUTTON} onClick={() => void copy()}>
        {copied ? 'Copied' : 'Copy source'}
      </button>
    </div>
  );
}
