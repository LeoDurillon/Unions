// The parts of a conversation with an agent (an investigation, an Explain): question bubbles, answer cards, folding.

import { useState, type ReactElement, type ReactNode } from 'react';

/** Long text starts folded to its first lines, with Show all. */
export function Folded({
  text,
  at,
  children,
}: {
  text: string;
  at: number;
  children: ReactNode;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const long = text.length > at;
  return (
    <div>
      <div
        className={
          long && !open
            ? 'max-h-40 overflow-hidden [mask-image:linear-gradient(black_70%,transparent)]'
            : ''
        }
      >
        {children}
      </div>
      {long ? (
        <button
          type="button"
          className="mt-1 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
          onClick={() => {
            setOpen(!open);
          }}
        >
          {open ? 'Show less' : 'Show all'}
        </button>
      ) : null}
    </div>
  );
}

/** A long question starts folded to its first lines. */
const FOLD_QUESTION_AT = 400;

/** The user's question, on the right; `children` go under its text (what it is about). */
export function QuestionBubble({
  label,
  text,
  children = null,
}: {
  label: string;
  text: string;
  children?: ReactNode;
}): ReactElement {
  return (
    <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-indigo-50 px-4 py-3 text-[13.5px] dark:bg-indigo-950/50">
      <p className="mb-1 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">{label}</p>
      <Folded text={text} at={FOLD_QUESTION_AT}>
        <p className="whitespace-pre-wrap">{text}</p>
      </Folded>
      {children}
    </div>
  );
}

/** The agent's answer, in a card. */
export function AnswerCard({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}): ReactElement {
  return (
    <article className="ticket-prose rounded-2xl border border-zinc-200 bg-white px-5 py-4 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="mb-1 text-[11px] font-semibold text-zinc-500">{label}</p>
      {children}
    </article>
  );
}
