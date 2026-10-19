// The editor under selected lines of the diff: a comment to add, or the lines to Explain with an optional question.
import { useEffect, useState, type ReactElement } from 'react';

import type { Selection } from '../../lib/diff-selection';
import { Button, ErrorText, inputClass } from '../ui';
import { useExplain, type ExplainState } from './explain-context';

/** Explain, and the question folded under it; nothing outside a review page. */
function ExplainControls({
  explain,
  path,
  selection,
}: {
  explain: ExplainState;
  path: string;
  selection: Selection;
}): ReactElement {
  const [question, setQuestion] = useState('');
  const { wantSpecs } = explain;
  useEffect(() => {
    wantSpecs();
  }, [wantSpecs]);
  const reading = explain.specs === null;
  return (
    <>
      <Button
        disabled={reading || explain.pending}
        title={reading ? 'Reading the specs…' : 'An agent explains these lines in the side panel'}
        onClick={() => {
          explain.explain({ path, ...selection, question: question.trim() || null });
          setQuestion('');
        }}
      >
        Explain
      </Button>
      <details className="text-xs text-zinc-500">
        <summary className="cursor-pointer">Ask a question</summary>
        <input
          className={`${inputClass} mt-1`}
          aria-label="Question for Explain"
          placeholder="Why is the retry needed here?"
          value={question}
          onChange={(event) => {
            setQuestion(event.target.value);
          }}
        />
      </details>
    </>
  );
}

type EditorProps = {
  path: string;
  selection: Selection;
  pending: boolean;
  error: Error | null;
  onSave: (body: string) => void;
  onCancel: () => void;
};

function Editor({
  path,
  selection,
  pending,
  error,
  onSave,
  onCancel,
  initial,
  explain,
}: EditorProps & { initial: string; explain: ExplainState | null }): ReactElement {
  const [body, setBody] = useState(initial);
  const range =
    selection.start === selection.end
      ? `line ${selection.start}`
      : `lines ${selection.start}-${selection.end}`;
  return (
    <div className="space-y-2 rounded-md border border-indigo-300 bg-indigo-50 p-2 dark:border-indigo-900 dark:bg-indigo-950/40">
      <p className="text-xs text-zinc-500">
        Comment on {range}. Shift-click another line number to extend the block.
      </p>
      <textarea
        className={`${inputClass} min-h-20`}
        aria-label="New comment"
        value={body}
        onChange={(event) => {
          setBody(event.target.value);
        }}
      />
      <ErrorText error={error ?? explain?.error ?? null} />
      <div className="flex flex-wrap items-start gap-2">
        <Button
          variant="primary"
          disabled={body.trim() === '' || pending}
          onClick={() => {
            onSave(body);
          }}
        >
          Add comment
        </Button>
        {explain ? <ExplainControls explain={explain} path={path} selection={selection} /> : null}
        <Button onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

/**
 * Shown under the selected lines; Shift-click another line number to extend the block. Copy as
 * comment (Explain panel) on these lines starts it again with the answer quoted.
 */
export function CommentEditor(props: EditorProps): ReactElement {
  const explain = useExplain();
  const focus = explain?.focus;
  const { path, selection } = props;
  const drafted =
    typeof focus?.draft === 'string' &&
    focus.path === path &&
    focus.side === selection.side &&
    focus.start === selection.start &&
    focus.end === selection.end
      ? focus
      : null;
  return (
    <Editor key={drafted?.seq ?? 0} {...props} initial={drafted?.draft ?? ''} explain={explain} />
  );
}
