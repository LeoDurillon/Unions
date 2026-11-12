// The files of the review the user marked viewed, shared by the header's progress, the file list and the open file.
// Kept in this browser, per review.

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';

import {
  readViewed,
  toggledViewed,
  viewedCount,
  viewedKey,
  writeViewed,
} from '../../lib/review/viewed-files';

type Sized = { path: string; additions: number; deletions: number };

export type Viewed = {
  isViewed: (file: Sized) => boolean;
  toggle: (file: Sized) => void;
  count: (files: readonly Sized[]) => number;
};

function keepNothing(): void {
  // Outside a review page there is nowhere to keep the mark.
}

/** Outside a review page nothing is marked, and marking does nothing. */
const NONE: Viewed = { isViewed: () => false, toggle: keepNothing, count: () => 0 };

const ViewedContext = createContext<Viewed>(NONE);

/** `review` names the review (its API base): its marks are its own, kept across reloads. */
export function ViewedProvider({
  review,
  children,
}: {
  review: string;
  children: ReactNode;
}): ReactElement {
  const [keys, setKeys] = useState(() => readViewed(review));
  const value = useMemo<Viewed>(
    () => ({
      isViewed: (file) => keys.has(viewedKey(file)),
      toggle: (file) => {
        const next = toggledViewed(keys, file);
        writeViewed(review, next);
        setKeys(next);
      },
      count: (files) => viewedCount(files, keys),
    }),
    [keys, review],
  );
  return <ViewedContext value={value}>{children}</ViewedContext>;
}

export function useViewed(): Viewed {
  return useContext(ViewedContext);
}
