// The user guide's page in the URL (`?guide=<page>`, a heading as the `#hash`), and opening it.

import { confirmLeave } from '../leave-guard';
import { CLOSE_REVIEW } from '../review/review-url';
import { NAVIGATED, readParam, useUrlParam } from '../url-state';

/** The guide's index page, `documentation/README.md`. */
const GUIDE_INDEX = 'README';

/** The guide page open, or null when the guide is not. */
export function useGuidePage(): string | null {
  return useUrlParam('guide');
}

/** Scrolls to the heading the URL's hash names, or to the top. */
export function scrollToAnchor(): void {
  const id = decodeURIComponent(globalThis.location.hash.slice(1));
  const target = id === '' ? null : globalThis.document.getElementById(id);
  if (target) {
    target.scrollIntoView();
  } else {
    globalThis.document.querySelector('[data-guide-top]')?.scrollTo(0, 0);
  }
}

/** Once the guide closed, drops the heading it left in the URL's hash. */
export function clearAnchorOnLeave(): void {
  if (readParam('guide') === null && globalThis.location.hash !== '') {
    const url = new URL(globalThis.location.href);
    url.hash = '';
    globalThis.history.replaceState(null, '', url);
  }
}

/** Opens a page of the guide, at a heading, in place of the board or the settings. */
export function openGuide(name: string = GUIDE_INDEX, anchor: string | null = null): void {
  if (!confirmLeave()) {
    return;
  }
  const url = new URL(globalThis.location.href);
  const closed = { page: null, union: null, settings: null, ticket: null, ...CLOSE_REVIEW };
  for (const param of Object.keys(closed)) {
    url.searchParams.delete(param);
  }
  url.searchParams.set('guide', name);
  url.hash = anchor ?? '';
  globalThis.history.pushState(null, '', url);
  globalThis.dispatchEvent(new Event(NAVIGATED));
  // Same page, other heading: nothing re-renders, so scroll here.
  globalThis.requestAnimationFrame(scrollToAnchor);
}
