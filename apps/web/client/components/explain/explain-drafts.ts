// What waits to be asked in each Explain conversation of a review (parts of the diff, a question), kept in the browser.

import { useCallback, useMemo, useState } from 'react';

import type { SubjectAsk } from '../../lib/review/explanation-api';

/** A conversation's next question, until it is sent. */
export type Draft = { subjects: SubjectAsk[]; question: string };

/** A conversation's id, or `new` for the one being started. */
export type DraftKey = number | 'new';

export type Drafts = {
  of: (key: DraftKey) => Draft;
  /** Adds a subject (once) and, when given, a question after the one typed. */
  add: (key: DraftKey, subject: SubjectAsk, question?: string | null) => void;
  set: (key: DraftKey, draft: Draft) => void;
  clear: (key: DraftKey) => void;
};

const EMPTY: Draft = { subjects: [], question: '' };

function storageKey(base: string): string {
  return `union.explain.drafts:${base}`;
}

function isDraft(value: unknown): value is Draft {
  return (
    typeof value === 'object' &&
    value !== null &&
    'subjects' in value &&
    Array.isArray(value.subjects) &&
    'question' in value &&
    typeof value.question === 'string'
  );
}

function read(base: string): Record<string, Draft> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(storageKey(base)) ?? '{}');
    if (typeof parsed !== 'object' || parsed === null) {
      return {};
    }
    return Object.fromEntries(Object.entries(parsed).filter(([, draft]) => isDraft(draft)));
  } catch {
    return {};
  }
}

function write(base: string, drafts: Record<string, Draft>): void {
  try {
    localStorage.setItem(storageKey(base), JSON.stringify(drafts));
  } catch {
    // Storage blocked: the drafts last until the page closes.
  }
}

/** The subject without what the server adds (a turn's lines carry their text). */
function askOf(subject: SubjectAsk): SubjectAsk {
  if (subject.kind === 'lines') {
    const { kind, path, side, start, end } = subject;
    return { kind, path, side, start, end };
  }
  return subject.kind === 'file' ? { kind: 'file', path: subject.path } : { kind: 'change' };
}

function joined(question: string, more: string | null | undefined): string {
  const extra = more?.trim() ?? '';
  if (extra === '') {
    return question;
  }
  return question.trim() === '' ? extra : `${question.trimEnd()}\n${extra}`;
}

/** The draft with the subject added (once) and the question after the one typed. */
export function withSubject(draft: Draft, subject: SubjectAsk, question?: string | null): Draft {
  const asked = askOf(subject);
  const known = draft.subjects.some((one) => JSON.stringify(one) === JSON.stringify(asked));
  return {
    subjects: known ? draft.subjects : [...draft.subjects, asked],
    question: joined(draft.question, question),
  };
}

/** The review's drafts (`base`: its API root), kept per conversation. */
export function useExplainDrafts(base: string): Drafts {
  const [drafts, setDrafts] = useState(() => read(base));
  const update = useCallback(
    (key: DraftKey, change: (draft: Draft) => Draft | null): void => {
      setDrafts((last) => {
        const name = String(key);
        const changed = change(last[name] ?? EMPTY);
        const kept = Object.entries(last).filter(([other]) => other !== name);
        const empty =
          changed === null || (changed.subjects.length === 0 && changed.question === '');
        const next = Object.fromEntries(empty ? kept : [...kept, [name, changed]]);
        write(base, next);
        return next;
      });
    },
    [base],
  );
  return useMemo(
    () => ({
      of: (key) => drafts[String(key)] ?? EMPTY,
      add: (key, subject, question) => {
        update(key, (draft) => withSubject(draft, subject, question));
      },
      set: (key, draft) => {
        update(key, () => draft);
      },
      clear: (key) => {
        update(key, () => null);
      },
    }),
    [drafts, update],
  );
}
