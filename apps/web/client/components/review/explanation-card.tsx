// One explanation and its follow-ups: the lines asked about, their spec parts, each answer, and what to do next.
import { useState, type ReactElement } from 'react';

import type { ExplanationView } from '../../../src/routes/review-explanations';
import type { useExplanations } from '../../lib/use-explanations';
import { Badge, Button, ErrorText, inputClass } from '../ui';
import type { ExplainState } from './explain-context';
import { ExplanationAnswer } from './explanation-answer';
import { ExplanationProgress } from './explanation-progress';

type Explanations = ReturnType<typeof useExplanations>;

/** `src/a.ts 40-58 (new)`. */
export function linesLabel(explanation: ExplanationView): string {
  const { path, startLine, endLine, side } = explanation;
  const lines = startLine === endLine ? `${startLine}` : `${startLine}-${endLine}`;
  return `${path} ${lines} (${side})`;
}

/** The answer quoted, for a comment the user edits before adding it. */
function quoted(explanation: ExplanationView): string {
  const text = explanation.result?.explanation ?? '';
  return `${text
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n')}\n\n`;
}

function Header({
  explanation,
  explain,
}: {
  explanation: ExplanationView;
  explain: ExplainState;
}): ReactElement {
  const { path, side, startLine: start, endLine: end } = explanation;
  return (
    <div className="space-y-1">
      <button
        type="button"
        className="text-left font-mono text-xs break-all text-indigo-700 hover:underline dark:text-indigo-300"
        onClick={() => {
          explain.show({ path, side, start, end });
        }}
      >
        {linesLabel(explanation)}
      </button>
      {explanation.specParts.length > 0 ? (
        <p className="flex flex-wrap items-center gap-1 text-xs">
          <span className="text-zinc-500">Spec parts:</span>
          {explanation.specParts.map((part) => (
            <Badge key={part.key} tone="blue" title={part.spec}>
              {part.title}
            </Badge>
          ))}
          {explanation.partsOutdated ? (
            <span className="text-amber-600">(older grouping)</span>
          ) : null}
        </p>
      ) : null}
      {explanation.outdated ? (
        <p className="flex items-center gap-2 text-xs">
          <Badge tone="amber">Outdated</Badge>
          <button
            type="button"
            className="text-indigo-700 hover:underline dark:text-indigo-300"
            onClick={() => {
              explain.explain({ path, side, start, end, question: explanation.question });
            }}
          >
            Explain again
          </button>
        </p>
      ) : null}
    </div>
  );
}

function Turn({
  turn,
  explain,
  explanations,
  paths,
}: {
  turn: ExplanationView;
  explain: ExplainState;
  explanations: Explanations;
  paths: ReadonlySet<string>;
}): ReactElement {
  const active = turn.status === 'queued' || turn.status === 'running';
  return (
    <div className="space-y-2">
      {turn.question ? <p className="text-sm font-medium">{turn.question}</p> : null}
      {active ? (
        <ExplanationProgress
          target={explain.target}
          explanation={turn}
          cancelling={explanations.cancel.isPending}
          onCancel={() => {
            explanations.cancel.mutate(turn.id);
          }}
        />
      ) : null}
      {turn.status === 'failed' ? (
        <p className="text-sm whitespace-pre-wrap text-red-600">{turn.error}</p>
      ) : null}
      {turn.status === 'cancelled' ? <p className="text-sm text-zinc-500">Cancelled.</p> : null}
      {turn.result ? (
        <ExplanationAnswer
          result={turn.result}
          paths={paths}
          onOpen={(citation) => {
            explain.show({
              path: citation.path,
              side: 'new',
              start: citation.line,
              end: citation.line,
            });
          }}
        />
      ) : null}
    </div>
  );
}

/** Ask a follow-up (in the same session) and Copy as comment, under the last answer. */
function Actions({
  last,
  explain,
  explanations,
}: {
  last: ExplanationView;
  explain: ExplainState;
  explanations: Explanations;
}): ReactElement {
  const [question, setQuestion] = useState('');
  const { path, side, startLine: start, endLine: end } = last;
  return (
    <div className="space-y-2 border-t border-zinc-200 pt-2 dark:border-zinc-800">
      <input
        className={inputClass}
        aria-label="Follow-up question"
        placeholder="Ask a follow-up"
        value={question}
        onChange={(event) => {
          setQuestion(event.target.value);
        }}
      />
      <ErrorText error={explanations.ask.error} />
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={question.trim() === '' || explanations.ask.isPending}
          onClick={() => {
            explanations.ask.mutate(
              { parentId: last.id, question: question.trim() },
              {
                onSuccess: () => {
                  setQuestion('');
                },
              },
            );
          }}
        >
          Ask a follow-up
        </Button>
        <Button
          onClick={() => {
            explain.show({ path, side, start, end, draft: quoted(last) });
          }}
        >
          Copy as comment
        </Button>
      </div>
    </div>
  );
}

/** A thread: the first explanation of some lines, then its follow-ups, oldest first. */
export function ExplanationThread({
  thread,
  explain,
  explanations,
  paths,
}: {
  thread: ExplanationView[];
  explain: ExplainState;
  explanations: Explanations;
  paths: ReadonlySet<string>;
}): ReactElement | null {
  const [first] = thread;
  const last = thread.at(-1);
  if (!first || !last) {
    return null;
  }
  return (
    <div className="space-y-3">
      <Header explanation={first} explain={explain} />
      {thread.map((turn) => (
        <Turn
          key={turn.id}
          turn={turn}
          explain={explain}
          explanations={explanations}
          paths={paths}
        />
      ))}
      {last.status === 'succeeded' ? (
        <Actions last={last} explain={explain} explanations={explanations} />
      ) : null}
    </div>
  );
}
