import { useState } from 'react';

export type Page = 'board' | 'agents';
export type Overlay = 'wizard' | 'settings' | 'ticket' | null;

/** Which page is shown and which overlay is open; `show`/`goTo` return click handlers. */
export function useNavigation(): {
  page: Page;
  overlay: Overlay;
  show: (next: Overlay) => () => void;
  goTo: (next: Page) => () => void;
  close: () => void;
} {
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [page, setPage] = useState<Page>('board');
  const show = (next: Overlay) => (): void => {
    setOverlay(next);
  };
  const goTo = (next: Page) => (): void => {
    setPage(next);
  };
  return { page, overlay, show, goTo, close: show(null) };
}
