// The review page's Explain state: the side panel, the specs an explanation is checked against, and the lines to show.

import type { AgentReviewSpec } from '@union/core';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';

import { useUrlParam } from '../../lib/app/url-state';
import { fileSelection, hunkSelection, type Selection } from '../../lib/review/diff-selection';
import type { ReviewTarget } from '../../lib/review/review-target';
import { diffLinesOf } from '../../lib/review/review-url';
import { useExplanations } from '../../lib/review/use-explanations';
import { useReviewSpecs } from '../../lib/review/use-review-specs';

const STORAGE_KEY = 'union.review.explain';

/** Lines to pick in the diff (opening an explanation), with a comment to start on them. */
export type ExplainFocus = Selection & { path: string; draft: string | null; seq: number };

export type ExplainState = {
  target: ReviewTarget;
  open: boolean;
  setOpen: (open: boolean) => void;
  /** The review's specs (its Specs bar); null while they are read. */
  specs: AgentReviewSpec[] | null;
  /** Reads the default specs: called when an editor that can Explain shows. */
  wantSpecs: () => void;
  explain: (lines: Selection & { path: string; question: string | null }) => void;
  pending: boolean;
  error: Error | null;
  focus: ExplainFocus | null;
  show: (lines: Selection & { path: string; draft?: string }) => void;
};

const ExplainContext = createContext<ExplainState | null>(null);

/** The Explain state; null outside a review page (a commit's diff on its own). */
export function useExplain(): ExplainState | null {
  return useContext(ExplainContext);
}

function stored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'open';
  } catch {
    return false;
  }
}

function remember(open: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, open ? 'open' : 'closed');
  } catch {
    // Storage blocked: the choice lasts until the page closes.
  }
}

type SetFocus = (next: (last: ExplainFocus | null) => ExplainFocus) => void;

/** Shows the lines the URL asks for (`?lines=`, a line comment's link from the PR tab). */
function useAskedLines(setFocus: SetFocus): void {
  const asked = useUrlParam('lines');
  useEffect(() => {
    const lines = diffLinesOf(asked);
    if (lines) {
      setFocus((last) => ({ ...lines, draft: null, seq: (last?.seq ?? 0) + 1 }));
    }
  }, [asked, setFocus]);
}

export function ExplainProvider({
  target,
  children,
}: {
  target: ReviewTarget;
  children: ReactNode;
}): ReactElement {
  const [open, setOpen] = useState(stored);
  const [wanted, setWanted] = useState(open);
  const [focus, setFocus] = useState<ExplainFocus | null>(null);
  useAskedLines(setFocus);
  const specs = useReviewSpecs(target, wanted || open).active;
  const { mutate, isPending, error } = useExplanations(target).ask;
  const state = useMemo((): ExplainState => {
    const choose = (next: boolean): void => {
      setOpen(next);
      remember(next);
    };
    return {
      target,
      open,
      setOpen: choose,
      specs,
      wantSpecs: () => {
        setWanted(true);
      },
      explain: ({ path, side, start, end, question }) => {
        choose(true);
        mutate({ path, side, start, end, question, specs: specs ?? [] });
      },
      pending: isPending,
      error,
      focus,
      show: ({ draft = null, ...lines }) => {
        setFocus((last) => ({ ...lines, draft, seq: (last?.seq ?? 0) + 1 }));
      },
    };
  }, [target, open, specs, mutate, isPending, error, focus]);
  return <ExplainContext.Provider value={state}>{children}</ExplainContext.Provider>;
}

/** Explain on a hunk's header (the whole hunk) and on a file's (every changed line of it). */
export type WholeExplain = { hunk: (header: string) => void; file: (patch: string) => void };

/** Undefined outside a review page, and until the specs are read. */
export function useWholeExplain(path: string | undefined): WholeExplain | undefined {
  const explain = useExplain();
  const wantSpecs = explain?.wantSpecs;
  useEffect(() => {
    wantSpecs?.();
  }, [wantSpecs]);
  if (!explain || path === undefined || explain.specs === null) {
    return undefined;
  }
  const ask = (range: Selection | null): void => {
    if (range) {
      explain.explain({ path, ...range, question: null });
    }
  };
  return {
    hunk: (header) => {
      ask(hunkSelection(header));
    },
    file: (patch) => {
      ask(fileSelection(patch));
    },
  };
}

/** Explain off under `off` (a split ticket's slice: its lines are not the whole change's). */
export function ExplainOff({ off, children }: { off: boolean; children: ReactNode }): ReactNode {
  return off ? (
    <ExplainContext.Provider value={null}>{children}</ExplainContext.Provider>
  ) : (
    children
  );
}
