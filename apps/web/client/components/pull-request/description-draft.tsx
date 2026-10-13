import { useState, type ReactElement } from 'react';

import type { PrDescriptionDraft } from '../../../src/api-types';
import { lineDiff } from '../../lib/line-diff';
import { Button } from '../ui';

const LINE_TONES = {
  same: 'text-zinc-500',
  added: 'bg-green-50 text-green-900 dark:bg-green-950/60 dark:text-green-200',
  removed: 'bg-red-50 text-red-900 line-through dark:bg-red-950/60 dark:text-red-200',
} as const;

/** What changes on GitHub: the current description against the draft, line by line. */
function Changes({ before, after }: { before: string; after: string }): ReactElement {
  return (
    <pre className="max-h-96 overflow-auto rounded-md border border-zinc-200 p-2 text-xs whitespace-pre-wrap dark:border-zinc-800">
      {lineDiff(before, after).map((line, index) => (
        // Lines repeat (blank ones above all): the position is the identity.
        // oxlint-disable-next-line react/no-array-index-key
        <div key={index} className={LINE_TONES[line.kind]}>
          {line.kind === 'added' ? '+ ' : null}
          {line.kind === 'removed' ? '- ' : null}
          {line.text === '' ? ' ' : line.text}
        </div>
      ))}
    </pre>
  );
}

function DraftButtons({
  text,
  busy,
  sending,
  onSend,
  onDiscard,
  onRewrite,
}: {
  text: string;
  busy: boolean;
  sending: boolean;
  onSend: (text: string) => void;
  onDiscard: () => void;
  onRewrite: () => void;
}): ReactElement {
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="primary"
        disabled={busy || sending || text.trim() === ''}
        onClick={() => {
          onSend(text);
        }}
      >
        {sending ? 'Updating on GitHub…' : 'Update on GitHub'}
      </Button>
      <Button disabled={busy || sending} onClick={onDiscard}>
        Discard
      </Button>
      <Button disabled={busy || sending} onClick={onRewrite}>
        Rewrite again
      </Button>
    </div>
  );
}

/** The rewritten description, editable, with what it changes on GitHub a click away. */
export function DescriptionDraft({
  draft,
  busy,
  onSend,
  onDiscard,
  onRewrite,
}: {
  draft: PrDescriptionDraft;
  busy: boolean;
  onSend: (text: string) => void;
  onDiscard: () => void;
  onRewrite: () => void;
}): ReactElement {
  const [text, setText] = useState(draft.text ?? '');
  const [showChanges, setShowChanges] = useState(false);
  const sending = draft.status === 'sending';
  return (
    <div className="space-y-2">
      <button
        type="button"
        className="text-xs text-indigo-600 hover:underline dark:text-indigo-400"
        onClick={() => {
          setShowChanges(!showChanges);
        }}
      >
        {showChanges ? 'Edit the new description' : 'Show the changes from the current one'}
      </button>
      {showChanges ? (
        <Changes before={draft.original ?? ''} after={text} />
      ) : (
        <textarea
          aria-label="New description"
          className="h-72 w-full rounded-md border border-zinc-300 bg-white p-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
          value={text}
          readOnly={sending}
          onChange={(event) => {
            setText(event.target.value);
          }}
        />
      )}
      <DraftButtons
        text={text}
        busy={busy}
        sending={sending}
        onSend={onSend}
        onDiscard={onDiscard}
        onRewrite={onRewrite}
      />
      <p className="text-xs text-zinc-500">
        Union adds its links (&quot;Closes #…&quot;) back when it updates the pull request. If
        someone edits the description on GitHub before you send, nothing is overwritten: you are
        asked to rewrite it again.
      </p>
    </div>
  );
}
