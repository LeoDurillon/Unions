// Whose reviews and comments the discussion shows: everyone's, people's only, or bots' only.
import { useState, type ReactElement } from 'react';

import type { PullRequestNote } from '../../../src/api-types';
import { Segmented } from '../choice';

export type NoteFilter = 'all' | 'people' | 'bots';

const STORAGE_KEY = 'union.discussion.filter';

function isFilter(value: string | null): value is NoteFilter {
  return value === 'all' || value === 'people' || value === 'bots';
}

function stored(): NoteFilter {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isFilter(value) ? value : 'all';
  } catch {
    return 'all';
  }
}

/** The filter, remembered in this browser. */
export function useNoteFilter(): [NoteFilter, (filter: NoteFilter) => void] {
  const [filter, setFilter] = useState<NoteFilter>(stored);
  const choose = (next: NoteFilter): void => {
    setFilter(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage blocked: the choice lasts until the page closes.
    }
  };
  return [filter, choose];
}

export function filterNotes(notes: PullRequestNote[], filter: NoteFilter): PullRequestNote[] {
  if (filter === 'all') {
    return notes;
  }
  return notes.filter((note) => note.bot === (filter === 'bots'));
}

/** The filter as a segmented control, with how many notes each choice shows. */
export function NoteFilterControl({
  notes,
  value,
  onChange,
}: {
  notes: PullRequestNote[];
  value: NoteFilter;
  onChange: (filter: NoteFilter) => void;
}): ReactElement {
  const bots = notes.filter((note) => note.bot).length;
  return (
    <Segmented
      legend="Show reviews and comments from"
      value={value}
      onChange={onChange}
      options={[
        { value: 'all', label: `All ${notes.length}` },
        { value: 'people', label: `People ${notes.length - bots}` },
        { value: 'bots', label: `Bots ${bots}` },
      ]}
    />
  );
}
