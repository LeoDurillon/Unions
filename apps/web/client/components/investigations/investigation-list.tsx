// The investigations beside the open one: New, a search, then the investigations by week. Each
// shows its state (a dot), its scope, the ticket written from it and its date.

import type { Investigation } from '@union/core';
import { useState, type ReactElement } from 'react';

import type { Tone } from '../../lib/board/labels';
import {
  groupByWeek,
  searchInvestigations,
  shortDate,
} from '../../lib/investigations/investigation-groups';
import { useNow } from '../../lib/ui/use-now';
import { Button, ErrorText, inputClass } from '../ui/ui';
import { isActive, SCOPE_LABELS, STATUS_LABELS } from './investigation-labels';

const DOT: Record<Tone, string> = {
  neutral: 'bg-zinc-400',
  blue: 'bg-blue-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
  green: 'bg-emerald-500',
};

function Item({
  investigation,
  selected,
  now,
  onSelect,
}: {
  investigation: Investigation;
  selected: boolean;
  now: number;
  onSelect: (id: number) => void;
}): ReactElement {
  const status = STATUS_LABELS[investigation.status];
  return (
    <li>
      <button
        type="button"
        aria-current={selected ? 'true' : undefined}
        title={`${investigation.title} (${status.label})`}
        onClick={() => {
          onSelect(investigation.id);
        }}
        className={`flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition ${selected ? 'bg-zinc-100 dark:bg-zinc-800/80' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/40'}`}
      >
        <span
          aria-label={status.label}
          className={`mt-1.5 size-2 shrink-0 rounded-full ${DOT[status.tone]} ${isActive(investigation.status) ? 'animate-pulse' : ''}`}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium">{investigation.title}</span>
          <span className="flex items-center gap-1.5 text-xs text-zinc-500">
            {SCOPE_LABELS[investigation.scope].title}
            {investigation.ticketId === null ? null : (
              <span className="rounded-full bg-indigo-50 px-1.5 font-medium text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
                → ticket
              </span>
            )}
          </span>
        </span>
        <span className="shrink-0 font-mono text-[11px] text-zinc-500">
          {shortDate(investigation.createdAt, now)}
        </span>
      </button>
    </li>
  );
}

function ListHeader({
  count,
  text,
  error,
  onText,
  onNew,
}: {
  count: number;
  text: string;
  error: Error | null;
  onText: (text: string) => void;
  onNew: () => void;
}): ReactElement {
  return (
    <div className="space-y-2.5 p-4 pb-2">
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-[15px] font-semibold">
          Investigations <span className="font-normal text-zinc-500">{count}</span>
        </h2>
        <Button variant="primary" size="sm" className="py-1" onClick={onNew}>
          + New
        </Button>
      </div>
      <input
        type="search"
        aria-label="Find an investigation"
        placeholder="Find an investigation"
        className={`${inputClass} py-1 text-xs`}
        value={text}
        onChange={(event) => {
          onText(event.target.value);
        }}
      />
      <ErrorText error={error} />
    </div>
  );
}

/** The investigations, newest first, in sections by week; New on top. */
export function InvestigationList({
  investigations,
  error,
  loaded,
  selectedId,
  onSelect,
  onNew,
}: {
  investigations: Investigation[];
  error: Error | null;
  loaded: boolean;
  /** The one shown, if any (none while the form is open). */
  selectedId: number | null;
  onSelect: (id: number) => void;
  onNew: () => void;
}): ReactElement {
  const [text, setText] = useState('');
  const now = useNow(false);
  const shown = searchInvestigations(investigations, text);
  return (
    <nav
      aria-label="Investigations"
      className="flex w-80 shrink-0 flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
    >
      <ListHeader
        count={investigations.length}
        text={text}
        error={error}
        onText={setText}
        onNew={onNew}
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {groupByWeek(shown, now).map((group) => (
          <section key={group.label} aria-label={group.label}>
            <h3 className="px-2.5 pt-3 pb-1 text-[11px] font-semibold tracking-wider text-zinc-500 uppercase">
              {group.label}
            </h3>
            <ul>
              {group.items.map((investigation) => (
                <Item
                  key={investigation.id}
                  investigation={investigation}
                  selected={investigation.id === selectedId}
                  now={now}
                  onSelect={onSelect}
                />
              ))}
            </ul>
          </section>
        ))}
        {loaded && shown.length === 0 ? (
          <p className="px-2.5 pt-3 text-sm text-zinc-500">
            {investigations.length === 0 ? 'No investigation yet.' : 'None matches.'}
          </p>
        ) : null}
      </div>
    </nav>
  );
}
