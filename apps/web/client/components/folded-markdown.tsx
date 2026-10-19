// A markdown text folded under "Show more" when it is taller than a few screens' worth.
import { useCallback, useState, type ReactElement } from 'react';

import { Markdown } from './markdown';

/** How tall a text shows before "Show more". */
const FOLDED_PX = 320;

export function FoldedMarkdown({
  children,
  files,
}: {
  children: string;
  /** Files by name, for the images the text shows. */
  files?: Record<string, string>;
}): ReactElement {
  const [long, setLong] = useState(false);
  const [open, setOpen] = useState(false);
  // The text's own height, followed as images load: folded only when it is taller than the fold.
  const measure = useCallback((node: HTMLDivElement | null): (() => void) | undefined => {
    if (!node) {
      return undefined;
    }
    const observer = new ResizeObserver(() => {
      setLong(node.offsetHeight > FOLDED_PX);
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, []);
  return (
    <>
      <div className={`relative ${long && !open ? 'max-h-80 overflow-hidden' : ''}`}>
        <div ref={measure}>
          <Markdown files={files}>{children}</Markdown>
        </div>
        {long && !open ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white dark:from-zinc-950" />
        ) : null}
      </div>
      {long ? (
        <button
          type="button"
          className="text-sm text-indigo-600 hover:underline dark:text-indigo-400"
          onClick={() => {
            setOpen(!open);
          }}
        >
          {open ? 'Show less' : 'Show more'}
        </button>
      ) : null}
    </>
  );
}
