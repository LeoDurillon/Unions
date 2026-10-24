// The review page, with its Explain panel's state.
import { useState, type ReactElement, type ReactNode } from 'react';

import type { CommentView } from '../../../src/api-types';
import { hasPullRequest, reviewCopy, type ReviewTarget } from '../../lib/review-target';
import { useCommentMutations, useComments, useDiff } from '../../lib/use-review';
import { useSliceView, type SliceView } from '../../lib/use-slice-view';
import { DiffArea } from './diff-area';
import { ExplainOff, ExplainProvider } from './explain-context';
import { ReviewHeader } from './review-header';
import { SliceTabs } from './slice-tabs';
import { useDiffView } from './view-toggle';

type Mutations = ReturnType<typeof useCommentMutations>;

/** A tab shown before the diff (a pull request's description, its comments). */
export type ReviewSection = { id: string; label: string; content: ReactNode };

function SectionTabs({
  sections,
  current,
  onChange,
}: {
  sections: { id: string; label: string }[];
  current: string;
  onChange: (id: string) => void;
}): ReactElement {
  return (
    <div
      role="tablist"
      aria-label="Review"
      className="flex gap-1 border-b border-zinc-200 px-4 dark:border-zinc-800"
    >
      {sections.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={current === id}
          onClick={() => {
            onChange(id);
          }}
          className={`border-b-2 px-3 py-2 text-sm whitespace-nowrap transition ${current === id ? 'border-indigo-600 font-medium' : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

const DIFF_TAB = { id: 'diff', label: 'Diff' };

/** The header's counts: every draft of the review, and the agent's not kept yet. */
function draftCounts(comments: CommentView[]): { drafts: number; suggestions: number } {
  const drafts = comments.filter((comment) => comment.status === 'draft');
  return {
    drafts: drafts.length,
    suggestions: drafts.filter((comment) => comment.author === 'agent').length,
  };
}
const NO_SECTIONS: ReviewSection[] = [];

/**
 * The diff, the comments and their writes, and the wording for the target. `comments` are all of
 * them (the header counts them); `slices` has what the picked slice of a split ticket shows.
 */
function useReviewData(
  target: ReviewTarget,
  posting: boolean,
): {
  diff: ReturnType<typeof useDiff>;
  comments: CommentView[];
  slices: SliceView;
  error: Error | null;
  mutations: Mutations;
  copy: ReturnType<typeof reviewCopy>;
  empty: boolean;
} {
  const diff = useDiff(target);
  const comments = useComments(target, posting);
  const files = diff.data?.files ?? [];
  const slices = useSliceView(target, files, comments.data ?? []);
  return {
    diff,
    comments: comments.data ?? [],
    slices,
    error: diff.error ?? comments.error ?? slices.error,
    mutations: useCommentMutations(slices.target),
    copy: reviewCopy(target),
    // A slice always has files: none is only its diff still loading.
    empty:
      slices.slice === null &&
      diff.data !== undefined &&
      (diff.data.snapshot === null || files.length === 0),
  };
}

function SectionBody({
  banner,
  children,
}: {
  banner: ReactNode;
  children: ReactNode;
}): ReactElement {
  return (
    <main className="min-h-0 flex-1 overflow-y-auto p-4">
      <div className="mx-auto max-w-4xl">
        {banner}
        {children}
      </div>
    </main>
  );
}

/**
 * Full-page review of a ticket's branch or of a pull request: touched files on the left, one file at
 * a time on the right. `sections` add tabs before the diff, and it opens on the first; `banner` shows
 * above the content (a pull request review's posting status); `stackTabs` go under the header.
 */
function ReviewPageBody({
  target,
  title,
  onClose,
  sections = NO_SECTIONS,
  stackTabs,
  banner,
  posting = false,
}: {
  target: ReviewTarget;
  title: string;
  onClose: () => void;
  sections?: ReviewSection[];
  /** The tabs of the stack the pull request is in, under the header. */
  stackTabs?: ReactNode;
  banner?: ReactNode;
  /** The review is being posted: its comments are polled until they turn sent. */
  posting?: boolean;
}): ReactElement {
  const { diff, comments, slices, error, mutations, copy, empty } = useReviewData(target, posting);
  const [view, setView] = useDiffView();
  const [tab, setTab] = useState(sections[0]?.id ?? DIFF_TAB.id);
  const section = sections.find((candidate) => candidate.id === tab);
  return (
    <ExplainOff off={slices.slice !== null}>
      <div className="fixed inset-0 z-30 flex flex-col bg-zinc-50 dark:bg-zinc-950">
        <ReviewHeader
          target={target}
          copy={copy}
          title={title}
          diff={diff.data}
          {...draftCounts(comments)}
          view={view}
          onView={setView}
          mutations={mutations}
          onClose={onClose}
        />
        {stackTabs ?? <SliceTabs view={slices} comments={comments} />}
        {sections.length > 0 ? (
          <SectionTabs sections={[...sections, DIFF_TAB]} current={tab} onChange={setTab} />
        ) : null}
        {section ? (
          <SectionBody banner={banner}>{section.content}</SectionBody>
        ) : (
          <DiffArea
            key={slices.slice ?? 'all'}
            target={slices.target}
            files={slices.files}
            comments={slices.comments}
            view={view}
            mutations={mutations}
            banner={banner}
            error={error}
            emptyText={empty ? copy.empty : null}
            hasPullRequest={hasPullRequest(target, diff.data)}
          />
        )}
      </div>
    </ExplainOff>
  );
}

/** The review page, with its Explain panel's state. */
export function ReviewPage(props: Parameters<typeof ReviewPageBody>[0]): ReactElement {
  return (
    <ExplainProvider target={props.target}>
      <ReviewPageBody {...props} />
    </ExplainProvider>
  );
}
