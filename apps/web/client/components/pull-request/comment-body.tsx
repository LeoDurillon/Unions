// A GitHub comment's text in compact markdown, folded behind a fade when it renders tall.
import { useEffect, useRef, useState, type ReactElement, type RefObject } from 'react';

import { Markdown } from '../markdown';

/** Taller than this (in pixels, as rendered) starts folded: reports, tables, walkthroughs. */
const FOLD_HEIGHT = 200;
/** The height a folded body shows. */
const FOLDED_CLASS = 'max-h-40 overflow-hidden';

/** Whether `ref`'s element renders taller than `FOLD_HEIGHT`, kept true as images load. */
function useTall(ref: RefObject<HTMLDivElement | null>): boolean {
  const [tall, setTall] = useState(false);
  useEffect(() => {
    const element = ref.current;
    const observer = new ResizeObserver(() => {
      setTall((element?.scrollHeight ?? 0) > FOLD_HEIGHT);
    });
    if (element) {
      observer.observe(element);
    }
    return (): void => {
      observer.disconnect();
    };
  }, [ref]);
  return tall;
}

export function CommentBody({ text }: { text: string }): ReactElement {
  const content = useRef<HTMLDivElement>(null);
  const tall = useTall(content);
  const [open, setOpen] = useState(false);
  const folded = tall && !open;
  return (
    <div>
      <div className={`relative ${folded ? FOLDED_CLASS : ''}`}>
        <div ref={content}>
          <Markdown compact github>
            {text}
          </Markdown>
        </div>
        {folded ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-white dark:from-zinc-900" />
        ) : null}
      </div>
      {tall ? (
        <button
          type="button"
          className="mt-1 text-xs text-indigo-600 hover:underline dark:text-indigo-400"
          onClick={() => {
            setOpen(!open);
          }}
        >
          {open ? 'Show less' : 'Show all'}
        </button>
      ) : null}
    </div>
  );
}
