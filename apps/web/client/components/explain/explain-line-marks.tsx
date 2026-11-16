// The lines of the open file that Explain conversations ask about, for the diff's gutter to mark and open them.

import type { ExplainLines } from '@union/core';
import { createContext, useContext, useMemo, type ReactElement, type ReactNode } from 'react';

import type { ConversationView } from '../../../src/routes/review/explanation-views';
import type { Side } from '../../lib/review/diff-selection';
import { useExplanations } from '../../lib/review/use-explanations';
import { useExplain, type ExplainState } from './explain-context';

/** A range of lines a conversation asks about. */
type Asked = { side: Side; start: number; end: number; id: number; title: string };

/** What marks a line: the conversations asking about it, newest first; `first`: one's range starts here. */
export type ExplainMark = {
  conversations: { id: number; title: string }[];
  first: boolean;
  open: (id: number) => void;
};

type MarkAt = (side: Side, line: number) => ExplainMark | null;

const ExplainMarksContext = createContext<MarkAt>(() => null);

/**
 * The ranges of `path` the conversations ask about, from their answers on the commit shown: an
 * outdated answer's lines may have moved.
 */
export function askedRanges(conversations: ConversationView[], path: string): Asked[] {
  return conversations.flatMap((conversation) =>
    conversation.turns
      .filter((turn) => !turn.outdated)
      .flatMap((turn) => turn.subjects)
      .filter(
        (subject): subject is ExplainLines => subject.kind === 'lines' && subject.path === path,
      )
      .map(({ side, start, end }) => ({
        side,
        start,
        end,
        id: conversation.id,
        title: conversation.title,
      })),
  );
}

export function markOf(
  asked: Asked[],
  side: Side,
  line: number,
  open: (id: number) => void,
): ExplainMark | null {
  const here = asked.filter(
    (range) => range.side === side && range.start <= line && line <= range.end,
  );
  if (here.length === 0) {
    return null;
  }
  const seen = new Map(here.map((range) => [range.id, { id: range.id, title: range.title }]));
  return {
    conversations: [...seen.values()],
    first: here.some((range) => range.start === line),
    open,
  };
}

function Marks({
  explain,
  path,
  children,
}: {
  explain: ExplainState;
  path: string;
  children: ReactNode;
}): ReactElement {
  const conversations = useExplanations(explain.target).explanations.data;
  const { open } = explain.conversation;
  const value = useMemo<MarkAt>(() => {
    const asked = askedRanges(conversations ?? [], path);
    return (side, line) => markOf(asked, side, line, open);
  }, [conversations, path, open]);
  return <ExplainMarksContext.Provider value={value}>{children}</ExplainMarksContext.Provider>;
}

/** Marks `path`'s lines that conversations ask about; nothing outside a review page or on a slice. */
export function ExplainMarksProvider({
  path,
  children,
}: {
  path: string;
  children: ReactNode;
}): ReactNode {
  const explain = useExplain();
  return explain ? (
    <Marks explain={explain} path={path}>
      {children}
    </Marks>
  ) : (
    children
  );
}

/** The Explain mark of a line; null for none, or outside a marked file. */
export function useExplainMark(side: Side, line: number | null): ExplainMark | null {
  const at = useContext(ExplainMarksContext);
  return line === null ? null : at(side, line);
}

/** On the first line of an asked range: opens the newest conversation asking about it. */
export function ExplainMarkButton({ mark }: { mark: ExplainMark }): ReactElement | null {
  const [newest] = mark.conversations;
  if (!mark.first || !newest) {
    return null;
  }
  const titles = mark.conversations.map((conversation) => `“${conversation.title}”`).join(', ');
  return (
    <button
      type="button"
      title={`Asked about in Explain: ${titles}`}
      aria-label={`Open the Explain conversation “${newest.title}”`}
      className="rounded bg-indigo-100 px-1 font-sans text-[10px] font-medium text-indigo-700 hover:bg-indigo-200 dark:bg-indigo-950 dark:text-indigo-300 dark:hover:bg-indigo-900"
      onClick={() => {
        mark.open(newest.id);
      }}
    >
      ?
    </button>
  );
}
