// The Guide page: the user guide (`documentation/`) as Union serves it, its pages on the left; links
// between its pages and to its headings stay in the app, links out open a new tab.

import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, type ReactElement } from 'react';

import { guideApi } from '../../lib/guide/guide-api';
import { guideLinkOf, guideUrl } from '../../lib/guide/guide-links';
import { clearAnchorOnLeave, openGuide, scrollToAnchor } from '../../lib/guide/guide-url';
import { Markdown } from '../markdown';
import { ErrorText } from '../ui';
import { GuideNav } from './guide-nav';

/** A click on a guide link opens it here; a link out opens a new tab. */
function followLink(event: MouseEvent): void {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) {
    return;
  }
  const href = (event.target instanceof Element ? event.target.closest('a') : null)?.getAttribute(
    'href',
  );
  if (href === null || href === undefined) {
    return;
  }
  const link = guideLinkOf(href);
  if (link !== null) {
    event.preventDefault();
    openGuide(link.name, link.anchor);
  } else if (/^https?:/u.test(href)) {
    event.preventDefault();
    globalThis.open(href, '_blank', 'noopener');
  }
}

/** The page `name` of the guide, with the list of pages beside it. */
export function GuidePage({ name }: { name: string }): ReactElement {
  const page = useQuery({ queryKey: ['guide', name], queryFn: () => guideApi.page(name) });
  // Listened on the article, not on each link: react-markdown draws them.
  const article = useCallback((element: HTMLElement): (() => void) => {
    element.addEventListener('click', followLink);
    return () => {
      element.removeEventListener('click', followLink);
    };
  }, []);
  const text = page.data?.text;
  useEffect(() => {
    if (text !== undefined) {
      scrollToAnchor();
    }
  }, [text]);
  useEffect(() => clearAnchorOnLeave, []);
  return (
    <div className="flex h-full min-w-0 flex-1">
      <GuideNav current={name} />
      <div data-guide-top className="min-w-0 flex-1 overflow-y-auto">
        <article
          ref={article}
          className="max-w-3xl px-8 pt-6 pb-16 [&_h1]:scroll-mt-4 [&_h2]:scroll-mt-4 [&_h3]:scroll-mt-4"
        >
          <ErrorText error={page.error} />
          {text === undefined ? null : (
            <Markdown anchors resolveUrl={guideUrl}>
              {text}
            </Markdown>
          )}
        </article>
      </div>
    </div>
  );
}
