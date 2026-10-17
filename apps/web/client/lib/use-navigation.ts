import { useState } from 'react';

import { closeSettings } from './settings-sections';

export type Page = 'board' | 'agents' | 'github-app' | 'previews';
export type Overlay = 'wizard' | 'ticket' | null;

/** Which page is shown and which overlay is open; `show`/`goTo` return click handlers. */
export function useNavigation(): {
  page: Page;
  overlay: Overlay;
  show: (next: Overlay) => () => void;
  goTo: (next: Page) => () => void;
  close: () => void;
  /** Leaves the project settings page, unless the user keeps its unsaved changes. */
  leave: () => boolean;
} {
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [page, setPage] = useState<Page>('board');
  const show = (next: Overlay) => (): void => {
    setOverlay(next);
  };
  // The project settings page is the board's: going anywhere else (or back to the board) leaves it.
  const goTo = (next: Page) => (): void => {
    if (closeSettings()) {
      setPage(next);
    }
  };
  return { page, overlay, show, goTo, close: show(null), leave: closeSettings };
}
