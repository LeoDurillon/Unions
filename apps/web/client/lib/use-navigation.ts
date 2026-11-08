// Which page is shown (`?page=previews`, `?union=` for the Union settings, else the board) and which overlay is open.

import { useState } from 'react';

import { openGuide } from './guide/guide-url';
import { confirmLeave } from './leave-guard';
import { closeSettings } from './settings-sections';
import { closeUnionSettings, openUnionSettings, useUnionSection } from './union-settings-sections';
import { readParam, setParams, useUrlParam } from './url-state';

export type Page = 'board' | 'previews' | 'settings' | 'guide';
export type Overlay = 'wizard' | 'ticket' | null;

function usePage(): Page {
  const union = useUnionSection();
  const param = useUrlParam('page');
  const guide = useUrlParam('guide');
  if (union !== null) {
    return 'settings';
  }
  if (guide !== null) {
    return 'guide';
  }
  return param === 'previews' ? 'previews' : 'board';
}

/** Shows the board or the running previews, closing both settings areas and the guide; nothing when already there. */
function showPage(next: 'board' | 'previews'): void {
  const target = { page: next === 'board' ? null : next, union: null, settings: null, guide: null };
  if (Object.entries(target).every(([name, value]) => readParam(name) === value)) {
    return;
  }
  if (confirmLeave()) {
    setParams(target);
  }
}

function leaveSettings(): boolean {
  return closeSettings() && closeUnionSettings();
}

/** Which page is shown and which overlay is open; `show`/`goTo` return click handlers. */
export function useNavigation(): {
  page: Page;
  overlay: Overlay;
  show: (next: Overlay) => () => void;
  goTo: (next: Page) => () => void;
  close: () => void;
  /** Leaves either settings area, unless the user keeps its unsaved changes. */
  leave: () => boolean;
} {
  const [overlay, setOverlay] = useState<Overlay>(null);
  const page = usePage();
  const show = (next: Overlay) => (): void => {
    setOverlay(next);
  };
  const goTo = (next: Page) => (): void => {
    if (next === 'guide') {
      openGuide();
    } else if (next !== 'settings') {
      showPage(next);
    } else if (page !== 'settings') {
      openUnionSettings();
    }
  };
  return { page, overlay, show, goTo, close: show(null), leave: leaveSettings };
}
