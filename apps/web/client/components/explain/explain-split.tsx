// Explain as a split button on the diff: the main part asks in a new conversation, its menu adds to an existing one.

import { useRef, useState, type ReactElement } from 'react';

import type { ConversationView } from '../../../src/routes/review/explanation-views';
import type { SubjectAsk } from '../../lib/review/explanation-api';
import { useExplanations } from '../../lib/review/use-explanations';
import { FOCUS_RING } from '../ui/focus';
import { MenuPanel, type MenuItem } from '../ui/overflow-menu';
import { useExplain, type ExplainState } from './explain-context';

/** The conversations offered under Add to: the current one, then the latest. */
const OFFERED = 4;

const LOOKS = {
  /** A button among others (the editor under selected lines). */
  button:
    'border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800',
  /** Small, on a hunk's header or a file's. */
  chip: 'border-indigo-300 px-1.5 font-sans text-xs text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-950',
} as const;

/** The current conversation (shown or added to last) first, then the latest, `OFFERED` at most. */
export function offeredConversations(
  conversations: ConversationView[],
  current: number | null,
): ConversationView[] {
  const first = conversations.find((conversation) => conversation.id === current);
  const rest = conversations.filter((conversation) => conversation.id !== current);
  return (first ? [first, ...rest] : rest).slice(0, OFFERED);
}

/** What a menu entry asks or adds, and what to do after. */
type Asked = { subject: SubjectAsk; question: string | null; onDone: () => void };

function itemsOf(
  explain: ExplainState,
  conversations: ConversationView[],
  { subject, question, onDone }: Asked,
): MenuItem[] {
  const shown = explain.conversation.id;
  const current = explain.collect.lastAdded ?? (typeof shown === 'number' ? shown : null);
  const ask = (): void => {
    explain.ask({ subjects: [subject], question });
    onDone();
  };
  return [
    { label: 'New conversation', onSelect: ask },
    ...offeredConversations(conversations, current).map((conversation) => ({
      label: `Add to “${conversation.title}”`,
      onSelect: () => {
        explain.collect.addTo(conversation, subject, question);
        onDone();
      },
    })),
  ];
}

type SplitProps = {
  subject: SubjectAsk;
  label?: string;
  title: string;
  /** Asked with the subject, or added with it to the conversation's question. */
  question?: string | null;
  look?: keyof typeof LOOKS;
  /** After asking or adding (the editor clears its question). */
  onDone?: () => void;
};

function Split({
  explain,
  subject,
  label = 'Explain',
  title,
  question = null,
  look = 'button',
  onDone,
}: SplitProps & { explain: ExplainState }): ReactElement {
  const conversations = useExplanations(explain.target).explanations.data ?? [];
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const reading = explain.specs === null;
  const items = itemsOf(explain, conversations, {
    subject,
    question,
    onDone: () => {
      onDone?.();
    },
  });
  const part = `rounded-none border ${LOOKS[look]} disabled:opacity-60 ${FOCUS_RING}`;
  return (
    <div ref={root} className="relative inline-flex shrink-0">
      <button
        type="button"
        title={reading ? 'Reading the specs…' : title}
        disabled={reading || explain.pending}
        className={`${part} rounded-l-md`}
        onClick={items[0]?.onSelect}
      >
        {label}
      </button>
      <button
        type="button"
        aria-label={`${label}: new conversation or add to one`}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={reading}
        className={`${part} -ml-px rounded-r-md px-1.5`}
        onClick={() => {
          setOpen(!open);
        }}
      >
        ▾
      </button>
      {open ? (
        <MenuPanel
          root={root}
          items={items}
          placement="top-full left-0 mt-1 max-w-96 font-sans"
          onClose={() => {
            setOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

/** Nothing outside a review page (a commit's diff on its own) or on a slice. */
export function ExplainSplit(props: SplitProps): ReactElement | null {
  const explain = useExplain();
  return explain ? <Split explain={explain} {...props} /> : null;
}
