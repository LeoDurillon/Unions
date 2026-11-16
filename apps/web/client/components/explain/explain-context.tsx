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

import { hunkSelection, type Selection } from '../../lib/review/diff-selection';
import type { ExplanationAsk, SubjectAsk } from '../../lib/review/explanation-api';
import { reviewBase, type ReviewTarget } from '../../lib/review/review-target';
import { useExplanations } from '../../lib/review/use-explanations';
import { useReviewSpecs } from '../../lib/review/use-review-specs';
import { useExplainCollect, type ExplainCollect } from './explain-collect';
import { useAskedLines, type ExplainFocus } from './explain-focus';
import { useOpenConversation, type OpenConversation } from './open-conversation';

/** A turn to ask; the review's specs are added. */
type ExplainAsk = Omit<ExplanationAsk, 'specs'>;

export type { ExplainFocus } from './explain-focus';

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
  /** Subjects gathered from the diff into a conversation's next question. */
  collect: ExplainCollect;
};

const ExplainContext = createContext<ExplainState | null>(null);

/** The Explain state; null outside a review page (a commit's diff on its own). */
export function useExplain(): ExplainState | null {
  return useContext(ExplainContext);
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
  const collect = useExplainCollect(reviewBase(target));
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
      collect,
    };
  }, [target, specs, mutate, isPending, error, focus, conversation, collect]);
  return <ExplainContext.Provider value={state}>{children}</ExplainContext.Provider>;
}

/** What Explain asks about from a file's header (the file) and its hunks' headers (the hunk). */
export type WholeExplain = { file: SubjectAsk; hunk: (header: string) => SubjectAsk | null };

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
    file: { kind: 'file', path },
    hunk: (header) => {
      const range = hunkSelection(header);
      return range ? { kind: 'lines', path, ...range } : null;
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
