// The slice a split ticket's review page shows, shared with its tabs so the PR tab follows the stack's tabs above.
import { createContext, useContext, useMemo, type ReactElement, type ReactNode } from 'react';

import type { SliceView } from '../../lib/use-slice-view';

type SlicePick = Pick<SliceView, 'slices' | 'slice' | 'setSlice'>;

const SlicePickContext = createContext<SlicePick | null>(null);

/** The review page's picked slice; null outside a review page. */
export function useSlicePick(): SlicePick | null {
  return useContext(SlicePickContext);
}

export function SlicePickProvider({
  view,
  children,
}: {
  view: SliceView;
  children: ReactNode;
}): ReactElement {
  const { slices, slice, setSlice } = view;
  const value = useMemo(() => ({ slices, slice, setSlice }), [slices, slice, setSlice]);
  return <SlicePickContext.Provider value={value}>{children}</SlicePickContext.Provider>;
}
