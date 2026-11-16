// The Explain conversations beside the open one: New, a search, then each with its state, question count and date.

import { useState, type ReactElement } from 'react';

import type { ConversationView } from '../../../src/routes/review/explanation-views';
import type { Tone } from '../../lib/board/labels';
import { shortDate } from '../../lib/investigations/investigation-groups';
import { useNow } from '../../lib/ui/use-now';
import { Button, inputClass } from '../ui/ui';

const DOT: Record<Tone, string> = {
  neutral: 'bg-zinc-400',
  blue: 'bg-blue-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
  green: 'bg-emerald-500',
};

/** The state of the conversation's last question, as a dot. */
export function conversationState(conversation: ConversationView): {
  label: string;
  tone: Tone;
  active: boolean;
} {
  const last = conversation.turns.at(-1);
  if (last?.status === 'queued' || last?.status === 'running') {
    return { label: 'The agent is answering', tone: 'blue', active: true };
  }
  if (last?.status === 'failed') {
    return { label: 'The last question failed', tone: 'red', active: false };
  }
  if (last?.outdated) {
    return { label: 'Answered on an older commit', tone: 'amber', active: false };
  }
  return last?.status === 'succeeded'
    ? { label: 'Answered', tone: 'green', active: false }
    : { label: 'No answer', tone: 'neutral', active: false };
}

/** The conversations whose title or questions hold every word of `text`. */
export function searchConversations(
  conversations: ConversationView[],
  text: string,
): ConversationView[] {
  const words = text.toLowerCase().split(/\s+/u).filter(Boolean);
  return conversations.filter((conversation) => {
    const haystack = [conversation.title, ...conversation.turns.map((turn) => turn.question ?? '')]
      .join(' ')
      .toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

function Item({
  conversation,
  selected,
  now,
  onSelect,
}: {
  conversation: ConversationView;
  selected: boolean;
  now: number;
  onSelect: (id: number) => void;
}): ReactElement {
  const state = conversationState(conversation);
  const count = conversation.turns.length;
  return (
    <li>
      <button
        type="button"
        aria-current={selected ? 'true' : undefined}
        title={`${conversation.title} (${state.label})`}
        onClick={() => {
          onSelect(conversation.id);
        }}
        className={`flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition ${selected ? 'bg-zinc-100 dark:bg-zinc-800/80' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/40'}`}
      >
        <span
          aria-label={state.label}
          className={`mt-1.5 size-2 shrink-0 rounded-full ${DOT[state.tone]} ${state.active ? 'animate-pulse' : ''}`}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium">{conversation.title}</span>
          <span className="text-xs text-zinc-500">
            {count === 1 ? '1 question' : `${count} questions`}
          </span>
        </span>
        <span className="shrink-0 font-mono text-[11px] text-zinc-500">
          {shortDate(conversation.updatedAt, now)}
        </span>
      </button>
    </li>
  );
}

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
  onNew,
}: {
  conversations: ConversationView[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onNew: () => void;
}): ReactElement {
  const [text, setText] = useState('');
  const now = useNow(false);
  const shown = searchConversations(conversations, text);
  return (
    <aside className="w-64 shrink-0 space-y-2.5" aria-label="Explain conversations">
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-[15px] font-semibold">
          Conversations <span className="font-normal text-zinc-500">{conversations.length}</span>
        </h2>
        <Button variant="primary" size="sm" className="py-1" onClick={onNew}>
          + New
        </Button>
      </div>
      {conversations.length > 1 ? (
        <input
          type="search"
          aria-label="Find a conversation"
          placeholder="Find a conversation"
          className={`${inputClass} py-1 text-xs`}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
          }}
        />
      ) : null}
      <ul className="space-y-0.5">
        {shown.map((conversation) => (
          <Item
            key={conversation.id}
            conversation={conversation}
            selected={conversation.id === selectedId}
            now={now}
            onSelect={onSelect}
          />
        ))}
      </ul>
      {text !== '' && shown.length === 0 ? (
        <p className="px-2.5 text-xs text-zinc-500">No conversation matches.</p>
      ) : null}
    </aside>
  );
}
