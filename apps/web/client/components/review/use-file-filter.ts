// The review's file filter: the letters typed, Not viewed and Code only. Code only is remembered in this browser;
// the others last while the page is open.
import { useState } from 'react';

import type { FileFilter } from '../../lib/review/file-filter';

const CODE_ONLY_KEY = 'union.review.codeOnly';

function storedCodeOnly(): boolean {
  try {
    return localStorage.getItem(CODE_ONLY_KEY) === 'on';
  } catch {
    return false;
  }
}

export type FileFilterState = {
  filter: FileFilter;
  setQuery: (query: string) => void;
  setCodeOnly: (on: boolean) => void;
  /** Only the files not marked viewed. */
  notViewed: boolean;
  setNotViewed: (on: boolean) => void;
};

/** The file filter's state: the query, and Code only remembered in this browser (off at first). */
export function useFileFilter(): FileFilterState {
  const [query, setQuery] = useState('');
  const [codeOnly, setCodeOnly] = useState(storedCodeOnly);
  const [notViewed, setNotViewed] = useState(false);
  const chooseCodeOnly = (on: boolean): void => {
    setCodeOnly(on);
    try {
      localStorage.setItem(CODE_ONLY_KEY, on ? 'on' : 'off');
    } catch {
      // Storage blocked: the choice lasts until the page closes.
    }
  };
  return {
    filter: { query, codeOnly },
    setQuery,
    setCodeOnly: chooseCodeOnly,
    notViewed,
    setNotViewed,
  };
}
