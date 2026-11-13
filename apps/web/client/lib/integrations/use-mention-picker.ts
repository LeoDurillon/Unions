// The state of a comment box's `@` picker: the name typed at the caret, the people it matches, the one highlighted.
// Also the keys that move, pick and close.

import type { TrackerPerson } from '@union/core/tracker-mention';
import { useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';

import { insertMention, mentionAt } from './mention-query';
import { useTrackerPeople, type MentionTarget } from './use-tracker-people';

export type MentionPicker = {
  /** The people shown under the box; empty when it is closed. */
  people: TrackerPerson[];
  highlighted: number;
  error: Error | null;
  /** Call with the textarea's caret after each change, click or key. */
  handleMove: (caret: number) => void;
  handleKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  handlePick: (person: TrackerPerson) => void;
};

type KeyContext = {
  shown: TrackerPerson[];
  highlighted: number;
  setHighlighted: (index: number) => void;
  pick: (person: TrackerPerson) => void;
  close: () => void;
};

/** Up and down move, Enter and Tab pick, Escape closes; other keys type as usual. */
function pickerKey(event: KeyboardEvent<HTMLTextAreaElement>, context: KeyContext): void {
  const { shown, highlighted, setHighlighted } = context;
  if (shown.length === 0) {
    return;
  }
  const choose = (): void => {
    const person = shown[Math.min(highlighted, shown.length - 1)];
    if (person) {
      context.pick(person);
    }
  };
  const actions: Partial<Record<string, () => void>> = {
    ArrowDown: () => {
      setHighlighted((highlighted + 1) % shown.length);
    },
    ArrowUp: () => {
      setHighlighted((highlighted - 1 + shown.length) % shown.length);
    },
    Enter: choose,
    Tab: choose,
    Escape: context.close,
  };
  const action = actions[event.key];
  if (action) {
    event.preventDefault();
    action();
  }
}

/** The picker of the textarea `ref` whose text is `value`, changed through `onChange`. */
export function useMentionPicker(
  ref: RefObject<HTMLTextAreaElement | null>,
  target: MentionTarget,
  text: { value: string; onChange: (value: string) => void },
): MentionPicker {
  const { value, onChange } = text;
  const [caret, setCaret] = useState(value.length);
  const [closedAt, setClosedAt] = useState<number | null>(null);
  const [highlighted, setHighlighted] = useState(0);
  const placeCaret = useRef<number | null>(null);
  const typed = mentionAt(value, caret);
  const at = typed && typed.start !== closedAt ? typed : null;
  const { people, error } = useTrackerPeople(target, at?.query ?? null);
  // After a pick re-renders the text, the caret goes after the token.
  useLayoutEffect(() => {
    if (placeCaret.current !== null) {
      ref.current?.setSelectionRange(placeCaret.current, placeCaret.current);
      placeCaret.current = null;
    }
  });
  const pick = (person: TrackerPerson): void => {
    if (!at) {
      return;
    }
    const done = insertMention(value, at, person);
    placeCaret.current = done.caret;
    onChange(done.text);
    setCaret(done.caret);
    ref.current?.focus();
  };
  const shown = at ? people : [];
  const close = (): void => {
    setClosedAt(at?.start ?? null);
  };
  return {
    people: shown,
    highlighted: Math.min(highlighted, Math.max(shown.length - 1, 0)),
    error: at ? error : null,
    handleMove: (next) => {
      setCaret(next);
      setHighlighted(0);
    },
    handleKeyDown: (event) => {
      pickerKey(event, { shown, highlighted, setHighlighted, pick, close });
    },
    handlePick: pick,
  };
}
