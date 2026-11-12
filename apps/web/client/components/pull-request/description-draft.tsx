// The rewritten description, editable, with what it changes on GitHub a click away.

import { useState, type ReactElement } from 'react';

import type { PrDescriptionDraft } from '../../../src/api-types';
import { lineDiff } from '../../lib/review/line-diff';
import { Markdown } from '../markdown/markdown';
import { Segmented } from '../ui/choice';
import { Button } from '../ui/ui';

type Mode = 'preview' | 'edit' | 'changes';

const MODES: { value: Mode; label: string }[] = [
  { value: 'preview', label: 'Preview' },
  { value: 'edit', label: 'Edit' },
  { value: 'changes', label: 'Changes from GitHub’s' },
];

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
  rewriteLabel,
}: {
  text: string;
  busy: boolean;
  sending: boolean;
  onSend: (text: string) => void;
  onDiscard: () => void;
  onRewrite: () => void;
  rewriteLabel: string | null;
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
      {rewriteLabel === null ? null : (
        <Button disabled={busy || sending} onClick={onRewrite}>
          {rewriteLabel}
        </Button>
      )}
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
  rewriteLabel,
}: {
  draft: PrDescriptionDraft;
  busy: boolean;
  onSend: (text: string) => void;
  onDiscard: () => void;
  onRewrite: () => void;
  /** `Rewrite again`; null: rewrites are asked elsewhere (a split ticket's stack panel). */
  rewriteLabel: string | null;
}): ReactElement {
  const [text, setText] = useState(draft.text ?? '');
  const [mode, setMode] = useState<Mode>('preview');
  const sending = draft.status === 'sending';
  return (
    <div className="space-y-2">
      <Segmented
        legend="Show the new description"
        options={MODES}
        value={mode}
        onChange={setMode}
      />
      {mode === 'changes' ? <Changes before={draft.original ?? ''} after={text} /> : null}
      {mode === 'preview' ? (
        <div className="max-h-96 overflow-auto rounded-lg border border-zinc-200 px-4 py-2 dark:border-zinc-800">
          <Markdown github>{text}</Markdown>
        </div>
      ) : null}
      {mode === 'edit' ? (
        <textarea
          aria-label="New description"
          className="h-72 w-full rounded-lg border border-zinc-300 bg-white p-3 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-950"
          value={text}
          readOnly={sending}
          onChange={(event) => {
            setText(event.target.value);
          }}
        />
      ) : null}
      <DraftButtons
        text={text}
        busy={busy}
        sending={sending}
        onSend={onSend}
        onDiscard={onDiscard}
        onRewrite={onRewrite}
        rewriteLabel={rewriteLabel}
      />
      <p className="text-xs text-zinc-500">
        Union adds its links (&quot;Closes #…&quot;, a stack&apos;s list) back when it updates the
        pull request. If someone edits the description on GitHub before you send, nothing is
        overwritten: you are asked to rewrite it again.
      </p>
    </div>
  );
}
