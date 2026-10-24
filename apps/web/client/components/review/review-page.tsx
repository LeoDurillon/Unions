// The review page, with its Explain panel's state.
import { useState, type ReactElement, type ReactNode } from 'react';

import type { CommentView } from '../../../src/api-types';
import type { ReviewTarget } from '../../lib/review-target';
import { useReviewData } from '../../lib/use-review-data';
import { DiffArea } from './diff-area';
import { ExplainOff, ExplainProvider } from './explain-context';
import { ReviewTop } from './review-top';
import { SliceTabs } from './slice-tabs';
import { SpecsEditingProvider } from './specs-editing';
import { useDiffView } from './view-toggle';

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

/** The open tab: `startOn`, else the first section, else the diff; `section` is undefined on the diff. */
function useSectionTab(
  sections: ReviewSection[],
  startOn: string | undefined,
): { tab: string; setTab: (id: string) => void; section: ReviewSection | undefined } {
  const [tab, setTab] = useState(startOn ?? sections[0]?.id ?? DIFF_TAB.id);
  return { tab, setTab, section: sections.find((candidate) => candidate.id === tab) };
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
  startOn,
  stackTabs,
  banner,
  posting = false,
}: {
  target: ReviewTarget;
  title: string;
  onClose: () => void;
  sections?: ReviewSection[];
  /** The tab to open on (`diff` for the diff), else the first. */
  startOn?: string;
  /** The tabs of the stack the pull request is in, under the header. */
  stackTabs?: ReactNode;
  banner?: ReactNode;
  /** The review is being posted: its comments are polled until they turn sent. */
  posting?: boolean;
}): ReactElement {
  const { diff, comments, slices, error, mutations, copy, empty } = useReviewData(target, posting);
  const [view, setView] = useDiffView();
  const { tab, setTab, section } = useSectionTab(sections, startOn);
  return (
    <ExplainOff off={slices.slice !== null}>
      <div className="fixed inset-0 z-30 flex flex-col bg-zinc-50 dark:bg-zinc-950">
        <ReviewTop
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
      <SpecsEditingProvider>
        <ReviewPageBody {...props} />
      </SpecsEditingProvider>
    </ExplainProvider>
  );
}
