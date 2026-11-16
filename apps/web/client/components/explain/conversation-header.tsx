// The top of an open Explain conversation: its title (renamed in place), how many questions, Export and Delete.

import { useEffect, useRef, useState, type ReactElement } from 'react';

import type { ConversationView } from '../../../src/routes/review/explanation-views';
import type { ReviewTarget } from '../../lib/review/review-target';
import { useConversationChanges } from '../../lib/review/use-explanations';
import { download } from '../../lib/ui/download';
import { ConfirmButton } from '../ui/confirm-button';
import { Button, ErrorText, inputClass } from '../ui/ui';
import { conversationFileName, conversationMarkdown } from './explain-export';

function Rename({
  title,
  onSave,
  onDone,
}: {
  title: string;
  onSave: (title: string) => void;
  onDone: () => void;
}): ReactElement {
  const [text, setText] = useState(title);
  const field = useRef<HTMLInputElement>(null);
  // The rename was asked for: the field takes the focus at once.
  useEffect(() => {
    field.current?.select();
  }, []);
  const save = (): void => {
    if (text.trim() !== '' && text.trim() !== title) {
      onSave(text.trim());
    }
    onDone();
  };
  return (
    <input
      aria-label="Conversation title"
      className={`${inputClass} flex-1 text-[15px] font-semibold`}
      ref={field}
      value={text}
      onChange={(event) => {
        setText(event.target.value);
      }}
      onBlur={save}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          save();
        }
        if (event.key === 'Escape') {
          onDone();
        }
      }}
    />
  );
}

type Changes = ReturnType<typeof useConversationChanges>;

/** Rename (while the title shows), Export, and Delete (asked first, not while a question waits). */
function Actions({
  conversation,
  renaming,
  waiting,
  remove,
  onRename,
  onDeleted,
}: {
  conversation: ConversationView;
  renaming: boolean;
  waiting: boolean;
  remove: Changes['remove'];
  onRename: () => void;
  onDeleted: () => void;
}): ReactElement {
  return (
    <div className="flex shrink-0 flex-wrap gap-2">
      {renaming ? null : (
        <Button size="sm" onClick={onRename}>
          Rename
        </Button>
      )}
      <Button
        size="sm"
        title="Download every question and answer as a Markdown file"
        onClick={() => {
          const file = new Blob([conversationMarkdown(conversation)], { type: 'text/markdown' });
          download(file, conversationFileName(conversation));
        }}
      >
        Export
      </Button>
      <ConfirmButton
        label="Delete"
        question="Delete this conversation and its answers?"
        confirmLabel="Delete for good"
        disabled={waiting || remove.isPending}
        onConfirm={() => {
          remove.mutate(conversation.id, { onSuccess: onDeleted });
        }}
      />
    </div>
  );
}

export function ConversationHeader({
  target,
  conversation,
  waiting,
  onDeleted,
}: {
  target: ReviewTarget;
  conversation: ConversationView;
  /** A question still waits for its answer: Delete waits too. */
  waiting: boolean;
  onDeleted: () => void;
}): ReactElement {
  const [renaming, setRenaming] = useState(false);
  const { rename, remove } = useConversationChanges(target);
  const count = conversation.turns.length;
  return (
    <header className="space-y-2 border-b border-zinc-200 pb-3 dark:border-zinc-800">
      <div className="flex items-center gap-2">
        {renaming ? (
          <Rename
            title={conversation.title}
            onSave={(title) => {
              rename.mutate({ id: conversation.id, title });
            }}
            onDone={() => {
              setRenaming(false);
            }}
          />
        ) : (
          <h2 className="min-w-0 flex-1 text-[15px] font-semibold break-words">
            {conversation.title}
          </h2>
        )}
        <Actions
          conversation={conversation}
          renaming={renaming}
          waiting={waiting}
          remove={remove}
          onRename={() => {
            setRenaming(true);
          }}
          onDeleted={onDeleted}
        />
      </div>
      <p className="text-xs text-zinc-500">
        {count === 1 ? '1 question' : `${count} questions`}
        {waiting ? ' · delete once the agent has answered' : ''}
      </p>
      <ErrorText error={rename.error ?? remove.error} />
    </header>
  );
}
