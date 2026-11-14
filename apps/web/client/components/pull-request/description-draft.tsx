// The rewritten description, editable, with what it changes on GitHub a click away.

import { useState, type ReactElement } from 'react';

import type { PrDescriptionDraft } from '../../../src/api-types';
import { lineDiff } from '../../lib/review/line-diff';
import { Markdown } from '../markdown/markdown';
import { Segmented } from '../ui/choice';
import { ConfirmButton } from '../ui/confirm-button';
import { Button, inputClass } from '../ui/ui';

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

/** Discard or rewrite: once the text was edited by hand, they ask first, as they lose the edits. */
function LosingButton({
  label,
  question,
  edited,
  disabled,
  quiet,
  onClick,
}: {
  label: string;
  question: string;
  edited: boolean;
  disabled: boolean;
  /** Red text: the action throws the draft away. */
  quiet: boolean;
  onClick: () => void;
}): ReactElement {
  if (edited) {
    return (
      <ConfirmButton
        label={label}
        question={question}
        confirmLabel={label}
        disabled={disabled}
        onConfirm={onClick}
      />
    );
  }
  return (
    <Button variant={quiet ? 'quietDanger' : 'secondary'} disabled={disabled} onClick={onClick}>
      {label}
    </Button>
  );
}

function DraftButtons({
  text,
  edited,
  busy,
  sending,
  onSend,
  onDiscard,
  onRewrite,
  rewriteLabel,
}: {
  text: string;
  /** The text differs from the agent's draft. */
  edited: boolean;
  busy: boolean;
  sending: boolean;
  onSend: (text: string) => void;
  onDiscard: () => void;
  onRewrite: () => void;
  rewriteLabel: string | null;
}): ReactElement {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="primary"
        disabled={busy || sending || text.trim() === ''}
        onClick={() => {
          onSend(text);
        }}
      >
        {sending ? 'Updating on GitHub…' : 'Update on GitHub'}
      </Button>
      {rewriteLabel === null ? null : (
        <LosingButton
          label={rewriteLabel}
          question="Rewrite it and lose your edits?"
          edited={edited}
          disabled={busy || sending}
          quiet={false}
          onClick={onRewrite}
        />
      )}
      <LosingButton
        label="Discard"
        question="Discard the new description and your edits?"
        edited={edited}
        disabled={busy || sending}
        quiet
        onClick={onDiscard}
      />
    </div>
  );
}

/** The draft as the picked mode shows it: rendered, in its textarea, or against GitHub's. */
function DraftView({
  mode,
  original,
  text,
  sending,
  onChange,
}: {
  mode: Mode;
  original: string;
  text: string;
  sending: boolean;
  onChange: (text: string) => void;
}): ReactElement {
  if (mode === 'changes') {
    return <Changes before={original} after={text} />;
  }
  if (mode === 'preview') {
    return (
      <div className="max-h-96 overflow-auto rounded-lg border border-zinc-200 px-4 py-2 dark:border-zinc-800">
        <Markdown github>{text}</Markdown>
      </div>
    );
  }
  return (
    <textarea
      aria-label="New description"
      className={`${inputClass} h-72 font-mono`}
      value={text}
      readOnly={sending}
      onChange={(event) => {
        onChange(event.target.value);
      }}
    />
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
      <DraftView
        mode={mode}
        original={draft.original ?? ''}
        text={text}
        sending={sending}
        onChange={setText}
      />
      <DraftButtons
        text={text}
        edited={text !== (draft.text ?? '')}
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
