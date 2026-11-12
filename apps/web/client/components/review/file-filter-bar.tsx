// The box above the review's files that narrows them by words of their path (`/` goes to it). Also
// the Code only switch, and the files they keep.

import { useRef, type ReactElement, type ReactNode } from 'react';

import { filterFiles } from '../../lib/review/file-filter';
import { useShortcuts } from '../../lib/ui/shortcuts';
import { inputClass } from '../ui/ui';
import { OFF, ON } from './group-by-spec-button';
import { useFileFilter, type FileFilterState } from './use-file-filter';

const CODE_ONLY_TITLE =
  "Hide what the change size does not count as code: tests, docs, lock files, migrations and the project's size patterns";

/** The filter box and the Code only switch. */
function FileFilterBar({ state }: { state: FileFilterState }): ReactElement {
  const input = useRef<HTMLInputElement>(null);
  const { filter, setQuery, setCodeOnly } = state;
  useShortcuts({ '/': () => input.current?.focus() });
  return (
    <div className="flex items-center gap-1.5 px-2">
      <input
        ref={input}
        type="search"
        value={filter.query}
        placeholder="Filter files (/)"
        aria-label="Filter files"
        onChange={(event) => {
          setQuery(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setQuery('');
            input.current?.blur();
          }
        }}
        className={`${inputClass} min-w-0 flex-1`}
      />
      <button
        type="button"
        aria-pressed={filter.codeOnly}
        title={CODE_ONLY_TITLE}
        className={`shrink-0 rounded-md border px-2 py-1.5 text-xs transition ${filter.codeOnly ? ON : OFF}`}
        onClick={() => {
          setCodeOnly(!filter.codeOnly);
        }}
      >
        Code only
      </button>
    </div>
  );
}

/** What the list shows when the filter leaves no file, with the way back. */
function NoFileMatches({ state }: { state: FileFilterState }): ReactElement {
  return (
    <p className="px-2 text-xs text-zinc-500">
      No file matches.{' '}
      <button
        type="button"
        className="underline hover:text-zinc-900 dark:hover:text-zinc-100"
        onClick={() => {
          state.setQuery('');
          state.setCodeOnly(false);
        }}
      >
        Clear the filter
      </button>
    </p>
  );
}

/**
 * The files the filter keeps, and the bar that sets it (with "No file matches" when it keeps none),
 * for the file list's `filterBar`.
 */
export function useFilteredFiles<T extends { path: string; oldPath: string; code: boolean }>(
  files: T[],
): { visible: T[]; bar: ReactNode } {
  const state = useFileFilter();
  const visible = filterFiles(files, state.filter);
  const bar = (
    <>
      <FileFilterBar state={state} />
      {visible.length === 0 && files.length > 0 ? <NoFileMatches state={state} /> : null}
    </>
  );
  return { visible, bar };
}
