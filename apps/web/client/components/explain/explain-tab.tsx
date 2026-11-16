// The review page's Explain tab: the conversations on the left, the open one (or a new one) on the right.

import { useEffect, type ReactElement } from 'react';

import type {
  ConversationView,
  ExplanationView,
} from '../../../src/routes/review/explanation-views';
import { useExplanations } from '../../lib/review/use-explanations';
import { useDiff } from '../../lib/review/use-review';
import { ConversationHeader } from './conversation-header';
import { ConversationList, conversationState } from './conversation-list';
import { ExplainComposer } from './explain-composer';
import { useExplain, type ExplainState } from './explain-context';
import { ExplainSplit } from './explain-split';
import { ExplainTurn, type OpenAt } from './explain-turn';

type Explanations = ReturnType<typeof useExplanations>;

/** Asks a turn's question about its subjects again, in its conversation. */
function askAgain(
  explain: ExplainState,
  conversationId: number,
  turn: ExplanationView,
): () => void {
  return () => {
    explain.ask({ conversationId, subjects: turn.subjects, question: turn.question });
  };
}

function Conversation({
  explain,
  conversation,
  explanations,
  paths,
  openAt,
}: {
  explain: ExplainState;
  conversation: ConversationView;
  explanations: Explanations;
  paths: ReadonlySet<string>;
  openAt: OpenAt;
}): ReactElement {
  const waiting = conversationState(conversation).active;
  const several = conversation.turns.length > 1;
  const cancel = {
    pending: explanations.cancel.isPending,
    run: (id: number) => {
      explanations.cancel.mutate(id);
    },
  };
  return (
    <div className="min-w-0 flex-1 space-y-4">
      <ConversationHeader
        target={explain.target}
        conversation={conversation}
        waiting={waiting}
        onDeleted={() => {
          explain.conversation.select(null);
        }}
      />
      {conversation.turns.map((turn, index) => (
        <ExplainTurn
          key={turn.id}
          turn={turn}
          number={several ? String(index + 1) : ''}
          explain={explain}
          paths={paths}
          openAt={openAt}
          cancel={cancel}
          onAgain={waiting ? null : askAgain(explain, conversation.id, turn)}
        />
      ))}
      <ExplainComposer
        key={conversation.id}
        explain={explain}
        conversationId={conversation.id}
        waiting={waiting}
      />
    </div>
  );
}

function NewConversation({
  explain,
  empty,
}: {
  explain: ExplainState;
  empty: boolean;
}): ReactElement {
  return (
    <div className="min-w-0 flex-1 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold">New conversation</h2>
        <ExplainSplit
          subject={{ kind: 'change' }}
          label="Explain the whole change"
          title="An agent explains how the whole change works, its main path first"
        />
      </div>
      {empty ? (
        <p className="text-sm text-zinc-500">
          Ask an agent how the change works. Select lines in the Diff tab and click Explain, click
          Explain on a hunk or Explain file next to a file name, or ask a question here.
        </p>
      ) : null}
      <ExplainComposer explain={explain} conversationId={null} waiting={false} />
    </div>
  );
}

function ExplainBody({
  explain,
  openDiff,
}: {
  explain: ExplainState;
  openDiff: () => void;
}): ReactElement {
  const all = useExplanations(explain.target);
  const { explanations } = all;
  const files = useDiff(explain.target).data?.files ?? [];
  const paths = new Set(files.map((file) => file.path));
  const { wantSpecs } = explain;
  useEffect(() => {
    wantSpecs();
  }, [wantSpecs]);
  const conversations = explanations.data ?? [];
  const picked = explain.conversation.id;
  const open =
    picked === 'new'
      ? undefined
      : (conversations.find((conversation) => conversation.id === picked) ?? conversations[0]);
  const openAt: OpenAt = (path, at, draft) => {
    explain.show({ path, ...at, draft });
    openDiff();
  };
  if (explanations.isPending) {
    return <p className="text-sm text-zinc-500">Reading the conversations…</p>;
  }
  return (
    <div className="flex gap-6">
      {conversations.length > 0 ? (
        <ConversationList
          conversations={conversations}
          selectedId={open?.id ?? null}
          onSelect={(id) => {
            explain.conversation.select(id);
          }}
          onNew={() => {
            explain.conversation.select('new');
          }}
        />
      ) : null}
      {open ? (
        <Conversation
          explain={explain}
          conversation={open}
          explanations={all}
          paths={paths}
          openAt={openAt}
        />
      ) : (
        <NewConversation explain={explain} empty={conversations.length === 0} />
      )}
    </div>
  );
}

/** `openDiff` switches to the Diff tab, where subjects and citations open. */
export function ExplainTab({ openDiff }: { openDiff: () => void }): ReactElement {
  const explain = useExplain();
  if (!explain) {
    return (
      <p className="text-sm text-zinc-500">
        Explain reads the whole change: pick All above to see its conversations.
      </p>
    );
  }
  return <ExplainBody explain={explain} openDiff={openDiff} />;
}
