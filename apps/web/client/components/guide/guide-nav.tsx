// The guide's pages down the left of the Guide page, the open one marked.

import { useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import { guideApi } from '../../lib/guide/guide-api';
import { guideHref } from '../../lib/guide/guide-links';
import { openGuide } from '../../lib/guide/guide-url';

const ACTIVE = 'bg-indigo-100 font-medium text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200';
const IDLE = 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800';

/** The guide's pages, in the index's order. */
export function GuideNav({ current }: { current: string }): ReactElement {
  const pages = useQuery({ queryKey: ['guide'], queryFn: guideApi.pages });
  return (
    <nav
      aria-label="Guide pages"
      className="w-56 shrink-0 overflow-y-auto border-r border-zinc-200 p-3 dark:border-zinc-800"
    >
      <ul className="space-y-0.5">
        {(pages.data?.pages ?? []).map((page) => (
          <li key={page.name}>
            <a
              href={guideHref(page.name)}
              aria-current={page.name === current ? 'page' : undefined}
              onClick={(event) => {
                event.preventDefault();
                openGuide(page.name);
              }}
              className={`block rounded-md px-2.5 py-1.5 text-sm ${page.name === current ? ACTIVE : IDLE}`}
            >
              {page.name === 'README' ? 'Introduction' : page.title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
