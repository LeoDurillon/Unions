// The feedback given on Revise and final reviews: each made a lesson or dismissed; the curated ones on request.
import type { FeedbackItem } from '@union/core';
import { useState, type ReactElement } from 'react';

import { STEP_TITLES } from '../../lib/labels';
import { closeSettings } from '../../lib/settings-sections';
import { setParams } from '../../lib/url-state';
import { Badge, Button, ErrorText } from '../ui';

/** What the page does with one feedback: start a lesson from it, or curate it at once. */
export type FeedbackActions = {
  /** Feedback already used by an unsaved lesson. */
  pending: readonly number[];
  makeLesson: (item: FeedbackItem) => void;
  setCurated: (id: number, curated: boolean) => void;
  busy: boolean;
  error: Error | null;
};

function stepTitle(section: string): string {
  return Object.entries(STEP_TITLES).find(([step]) => step === section)?.[1] ?? section;
}

function TicketLink({ item }: { item: FeedbackItem }): ReactElement {
  const { ticketId } = item;
  if (ticketId === null || item.ticketTitle === null) {
    return <span className="text-zinc-500">a removed ticket</span>;
  }
  const number = item.issueNumber === null ? '' : `#${item.issueNumber} `;
  return (
    <button
      type="button"
      className="truncate text-indigo-600 hover:underline dark:text-indigo-400"
      onClick={() => {
        if (closeSettings()) {
          setParams({ ticket: String(ticketId) });
        }
      }}
    >
      {number}
      {item.ticketTitle}
    </button>
  );
}

function ItemActions({
  item,
  actions,
}: {
  item: FeedbackItem;
  actions: FeedbackActions;
}): ReactElement {
  if (actions.pending.includes(item.id)) {
    return <span className="text-xs text-amber-700 dark:text-amber-400">In an unsaved lesson</span>;
  }
  if (item.curatedAt !== null) {
    return (
      <Button
        className="px-2 py-1 text-xs"
        disabled={actions.busy}
        onClick={() => {
          actions.setCurated(item.id, false);
        }}
      >
        Back to new
      </Button>
    );
  }
  return (
    <div className="flex gap-2">
      <Button
        className="px-2 py-1 text-xs"
        onClick={() => {
          actions.makeLesson(item);
        }}
      >
        Make a lesson
      </Button>
      <Button
        className="px-2 py-1 text-xs"
        disabled={actions.busy}
        onClick={() => {
          actions.setCurated(item.id, true);
        }}
      >
        Dismiss
      </Button>
    </div>
  );
}

function FeedbackCard({
  item,
  actions,
}: {
  item: FeedbackItem;
  actions: FeedbackActions;
}): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <li className="space-y-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge tone={item.curatedAt === null ? 'blue' : 'neutral'}>{stepTitle(item.section)}</Badge>
        <TicketLink item={item} />
        <span className="text-zinc-500">{new Date(item.createdAt).toLocaleString()}</span>
      </div>
      <button
        type="button"
        title={open ? 'Show less' : 'Show all'}
        className="w-full text-left"
        onClick={() => {
          setOpen(!open);
        }}
      >
        <p className={`whitespace-pre-wrap text-sm ${open ? '' : 'line-clamp-3'}`}>{item.text}</p>
      </button>
      <ItemActions item={item} actions={actions} />
    </li>
  );
}

/** New feedback first; the curated ones are listed when asked. */
export function FeedbackInbox({
  feedback,
  actions,
}: {
  feedback: readonly FeedbackItem[];
  actions: FeedbackActions;
}): ReactElement {
  const [showCurated, setShowCurated] = useState(false);
  const fresh = feedback.filter((item) => item.curatedAt === null);
  const shown = showCurated ? feedback : fresh;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-500">
          {fresh.length} new of {feedback.length}
        </p>
        <label className="flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={showCurated}
            onChange={(event) => {
              setShowCurated(event.target.checked);
            }}
          />
          Show curated
        </label>
      </div>
      <ErrorText error={actions.error} />
      {shown.length === 0 ? (
        <p className="text-xs text-zinc-500">
          Nothing new: feedback lands here when you click Revise.
        </p>
      ) : (
        <ul className="space-y-2">
          {shown.map((item) => (
            <FeedbackCard key={item.id} item={item} actions={actions} />
          ))}
        </ul>
      )}
    </div>
  );
}
