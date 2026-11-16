// The review page's Explain state: asking (which opens the Explain tab on its conversation), the specs, the lines to show.

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
import { hunkSelection, type Selection } from '../../lib/review/diff-selection';
import type { ExplanationAsk } from '../../lib/review/explanation-api';
import type { ReviewTarget } from '../../lib/review/review-target';
import { diffLinesOf } from '../../lib/review/review-url';
import { useExplanations } from '../../lib/review/use-explanations';
import { useReviewSpecs } from '../../lib/review/use-review-specs';
import { useOpenConversation, type OpenConversation } from './open-conversation';

/** Lines to pick in the diff (opening a cited line), with a comment to start on them. */
export type ExplainFocus = Selection & { path: string; draft: string | null; seq: number };

/** A turn to ask; the review's specs are added. */
type ExplainAsk = Omit<ExplanationAsk, 'specs'>;

export type ExplainState = {
  target: ReviewTarget;
  /** The review's specs (its Specs bar); null while they are read. */
  specs: AgentReviewSpec[] | null;
  /** Reads the default specs: called when an editor that can Explain shows. */
  wantSpecs: () => void;
  /** Asks a turn, then opens the Explain tab on its conversation. */
  ask: (ask: ExplainAsk, onAsked?: () => void) => void;
  /** Asks about lines in a new conversation. */
  explain: (lines: Selection & { path: string; question: string | null }) => void;
  pending: boolean;
  error: Error | null;
  focus: ExplainFocus | null;
  show: (lines: Selection & { path: string; draft?: string }) => void;
  /** The conversation the Explain tab shows, and opening one (`new` for a new one) there. */
  conversation: OpenConversation;
};

const ExplainContext = createContext<ExplainState | null>(null);

/** The Explain state; null outside a review page (a commit's diff on its own). */
export function useExplain(): ExplainState | null {
  return useContext(ExplainContext);
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

/** `onOpenTab` switches the review page to its Explain tab. */
export function ExplainProvider({
  target,
  onOpenTab,
  children,
}: {
  target: ReviewTarget;
  onOpenTab: () => void;
  children: ReactNode;
}): ReactElement {
  const [wanted, setWanted] = useState(false);
  const [focus, setFocus] = useState<ExplainFocus | null>(null);
  useAskedLines(setFocus);
  const specs = useReviewSpecs(target, wanted).active;
  const { mutate, isPending, error } = useExplanations(target).ask;
  const conversation = useOpenConversation(onOpenTab);
  const state = useMemo((): ExplainState => {
    const ask = (turn: ExplainAsk, onAsked?: () => void): void => {
      mutate(specs === null ? turn : { ...turn, specs }, {
        onSuccess: (asked) => {
          onAsked?.();
          conversation.open(asked.conversationId);
        },
      });
    };
    return {
      target,
      specs,
      wantSpecs: () => {
        setWanted(true);
      },
      ask,
      explain: ({ path, side, start, end, question }) => {
        ask({ subjects: [{ kind: 'lines', path, side, start, end }], question });
      },
      pending: isPending,
      error,
      focus,
      show: ({ draft = null, ...lines }) => {
        setFocus((last) => ({ ...lines, draft, seq: (last?.seq ?? 0) + 1 }));
      },
      conversation,
    };
  }, [target, specs, mutate, isPending, error, focus, conversation]);
  return <ExplainContext.Provider value={state}>{children}</ExplainContext.Provider>;
}

/** Explain on a hunk's header (the whole hunk) and on a file's name (the file). */
export type WholeExplain = { hunk: (header: string) => void; file: () => void };

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
  return {
    hunk: (header) => {
      const range = hunkSelection(header);
      if (range) {
        explain.explain({ path, ...range, question: null });
      }
    },
    file: () => {
      explain.ask({ subjects: [{ kind: 'file', path }], question: null });
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
