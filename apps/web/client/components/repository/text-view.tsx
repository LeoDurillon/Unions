// A text file of the repository with its line numbers, highlighted for its language up to a few thousand lines.
import { useMemo, type ReactElement, type ReactNode } from 'react';

import { languageFor, tokenize, type Token } from '../../lib/highlight';

/** Past this many lines the rest shows plain: highlighting a generated file would freeze the page. */
const HIGHLIGHT_LINES = 5000;

function highlighted(text: string, path: string): { lines: string[]; tokens: Token[][] } {
  const lines = text.endsWith('\n') ? text.slice(0, -1).split('\n') : text.split('\n');
  const language = languageFor(path);
  if (language === null) {
    return { lines, tokens: [] };
  }
  return { lines, tokens: tokenize(lines.slice(0, HIGHLIGHT_LINES).join('\n'), language) };
}

function Line({ text, tokens }: { text: string; tokens: Token[] | undefined }): ReactNode {
  if (!tokens) {
    return text;
  }
  return (
    <>
      {tokens.map((token) => (
        <span key={token.start} className={token.className}>
          {token.text}
        </span>
      ))}
    </>
  );
}

/** The file's lines, numbered, highlighted when its language is known. */
export function TextView({ text, path }: { text: string; path: string }): ReactElement {
  const { lines, tokens } = useMemo(() => highlighted(text, path), [text, path]);
  const numbered = useMemo(
    () => lines.map((line, index) => ({ number: index + 1, line })),
    [lines],
  );
  if (text === '') {
    return <p className="p-4 text-sm text-zinc-500">This file is empty.</p>;
  }
  return (
    <div className="overflow-x-auto">
      {lines.length > HIGHLIGHT_LINES && tokens.length > 0 ? (
        <p className="border-b border-zinc-200 px-4 py-1 text-xs text-zinc-500 dark:border-zinc-800">
          {lines.length} lines: the first {HIGHLIGHT_LINES} are highlighted.
        </p>
      ) : null}
      <table className="w-full border-collapse font-mono text-xs leading-5">
        <tbody>
          {numbered.map(({ number, line }) => (
            <tr key={number} id={`L${number}`}>
              <td className="w-px select-none px-3 text-right align-top text-zinc-500 tabular-nums">
                {number}
              </td>
              <td className="whitespace-pre pr-4">
                <Line text={line} tokens={tokens[number - 1]} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
