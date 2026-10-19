import { useState, type ReactElement, type ReactNode } from 'react';

import type { CommentView, DiffResponse } from '../../../src/api-types';
import { reviewCopy, type ReviewTarget } from '../../lib/review-target';
import { useCommentMutations, useComments, useDiff } from '../../lib/use-review';
import { DiffArea } from './diff-area';
import { ExplainProvider } from './explain-context';
import { ReviewHeader } from './review-header';
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
const NO_SECTIONS: ReviewSection[] = [];

/** The diff, the comments and their writes, and the wording for the target. */
function useReviewData(
  target: ReviewTarget,
  posting: boolean,
): {
  diff: ReturnType<typeof useDiff>;
  comments: CommentView[];
  error: Error | null;
  mutations: Mutations;
  copy: ReturnType<typeof reviewCopy>;
  files: DiffResponse['files'];
  empty: boolean;
} {
  const diff = useDiff(target);
  const comments = useComments(target, posting);
  const files = diff.data?.files ?? [];
  return {
    diff,
    comments: comments.data ?? [],
    error: diff.error ?? comments.error,
    mutations: useCommentMutations(target),
    copy: reviewCopy(target),
    files,
    empty: diff.data !== undefined && (diff.data.snapshot === null || files.length === 0),
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
  const { diff, comments, error, mutations, copy, files, empty } = useReviewData(target, posting);
  const [view, setView] = useDiffView();
  const [tab, setTab] = useState(sections[0]?.id ?? DIFF_TAB.id);
  const section = sections.find((candidate) => candidate.id === tab);
  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-zinc-50 dark:bg-zinc-950">
      <ReviewHeader
        target={target}
        copy={copy}
        title={title}
        diff={diff.data}
        drafts={comments.filter((comment) => comment.status === 'draft').length}
        suggestions={
          comments.filter((comment) => comment.status === 'draft' && comment.author === 'agent')
            .length
        }
        view={view}
        onView={setView}
        mutations={mutations}
        onClose={onClose}
      />
      {stackTabs}
      {sections.length > 0 ? (
        <SectionTabs sections={[...sections, DIFF_TAB]} current={tab} onChange={setTab} />
      ) : null}
      {section ? (
        <SectionBody banner={banner}>{section.content}</SectionBody>
      ) : (
        <DiffArea
          target={target}
          files={files}
          comments={comments}
          view={view}
          mutations={mutations}
          banner={banner}
          error={error}
          emptyText={empty ? copy.empty : null}
        />
      )}
    </div>
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
