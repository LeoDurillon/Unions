// Help under a control: its first sentence, the rest behind "more", so long explanations do not bury
// the controls.
import { useState, type ReactElement } from 'react';

/** The first sentence: up to the first ". " or ": " that ends it, else the whole text. */
function firstSentence(text: string): string {
  const end = text.search(/[.;]\s/u);
  return end === -1 ? text : text.slice(0, end + 1);
}

export function HelpText({ children }: { children: string }): ReactElement {
  const [open, setOpen] = useState(false);
  const short = firstSentence(children);
  const more = short.length < children.length;
  return (
    <p className="text-xs text-zinc-500">
      {open || !more ? children : short}
      {more ? (
        <>
          {' '}
          <button
            type="button"
            aria-expanded={open}
            className="text-indigo-600 hover:underline dark:text-indigo-400"
            onClick={() => {
              setOpen(!open);
            }}
          >
            {open ? 'less' : 'more'}
          </button>
        </>
      ) : null}
    </p>
  );
}
