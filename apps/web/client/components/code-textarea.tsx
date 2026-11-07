// A monospace textarea that colours its text for a language (Dockerfile, YAML): the highlighted copy sits behind a transparent textarea.
import {
  useMemo,
  useRef,
  type ReactElement,
  type ReactNode,
  type RefObject,
  type UIEvent,
} from 'react';

import { tokenize } from '../lib/highlight';

/** Past this many characters the text stays plain: highlighting on each key would lag. */
const HIGHLIGHT_CHARS = 100_000;

/** What the textarea and its highlighted copy share, so their characters line up. */
const TEXT_CLASS = 'm-0 border-0 px-3 py-2 font-mono text-xs leading-5 whitespace-pre [tab-size:4]';

/** A run of the highlighted text, line breaks included, keyed by its line and column. */
type Run = { key: string; text: string; className: string };

function runsOf(value: string, language: string): Run[] | null {
  if (value.length > HIGHLIGHT_CHARS) {
    return null;
  }
  const runs: Run[] = [];
  for (const [number, line] of tokenize(value, language).entries()) {
    if (number > 0) {
      runs.push({ key: `${number}`, text: '\n', className: '' });
    }
    for (const token of line) {
      runs.push({ key: `${number}:${token.start}`, text: token.text, className: token.className });
    }
  }
  return runs;
}

/** Keeps the highlighted copy scrolled with the textarea. */
function useScrollFollow(): {
  backdrop: RefObject<HTMLPreElement | null>;
  onScroll: (event: UIEvent<HTMLTextAreaElement>) => void;
} {
  const backdrop = useRef<HTMLPreElement>(null);
  const onScroll = (event: UIEvent<HTMLTextAreaElement>): void => {
    if (backdrop.current) {
      backdrop.current.scrollTop = event.currentTarget.scrollTop;
      backdrop.current.scrollLeft = event.currentTarget.scrollLeft;
    }
  };
  return { backdrop, onScroll };
}

function Highlighted({ value, runs }: { value: string; runs: Run[] | null }): ReactNode {
  // A trailing line break needs a character after it, or the copy is one line short of the textarea.
  const tail = value.endsWith('\n') ? ' ' : '';
  if (!runs) {
    return value + tail;
  }
  return (
    <>
      {runs.map((run) => (
        <span key={run.key} className={run.className}>
          {run.text}
        </span>
      ))}
      {tail}
    </>
  );
}

/**
 * A code field coloured for `language` (a highlight.js name). `className` sizes the textarea (height,
 * `resize-y`); the box grows with it. Without `onChange` it is read-only.
 */
export function CodeTextarea({
  value,
  language,
  className = 'h-32',
  onChange,
  ...rest
}: {
  value: string;
  language: string;
  className?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  'aria-label'?: string;
}): ReactElement {
  const runs = useMemo(() => runsOf(value, language), [value, language]);
  const { backdrop, onScroll } = useScrollFollow();
  return (
    <div className="relative w-full rounded-md border border-zinc-300 bg-white focus-within:border-indigo-500 dark:border-zinc-700 dark:bg-zinc-900">
      <pre
        ref={backdrop}
        aria-hidden
        className={`${TEXT_CLASS} pointer-events-none absolute inset-0 overflow-hidden text-zinc-800 dark:text-zinc-200`}
      >
        <Highlighted value={value} runs={runs} />
      </pre>
      <textarea
        {...rest}
        className={`${TEXT_CLASS} relative block w-full bg-transparent text-transparent caret-zinc-900 outline-none placeholder:text-zinc-400 dark:caret-zinc-100 ${className}`}
        value={value}
        wrap="off"
        spellCheck={false}
        readOnly={!onChange}
        onScroll={onScroll}
        onChange={(event) => {
          onChange?.(event.target.value);
        }}
      />
    </div>
  );
}
