// The frame of both settings areas: a way back, a title, the open page's name with its Learn more link. The menu
// is on the left, the page on the right.

import type { ReactElement, ReactNode } from 'react';

import type { GuideTarget } from '../../lib/guide/settings-guide';
import { GuideLink } from '../guide/guide-link';

export function SettingsFrame({
  title,
  subtitle,
  pageKey,
  nav,
  onBack,
  guide,
  children,
}: {
  title: string;
  subtitle: string;
  /** The part of the user guide on the open page, for its Learn more link. */
  guide: GuideTarget;
  /** Remounts the page when it changes, so a form starts from what is saved. */
  pageKey: string;
  nav: ReactNode;
  onBack: () => void;
  children: ReactNode;
}): ReactElement {
  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-zinc-200 bg-white px-5 py-3 dark:border-zinc-800 dark:bg-zinc-950">
        <button
          type="button"
          aria-label="Back to the board"
          title="Back to the board"
          onClick={onBack}
          className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          <span aria-hidden>←</span>
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-semibold">{title}</h2>
          <p className="text-xs text-zinc-500">
            {subtitle} · <GuideLink target={guide} />
          </p>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="w-60 shrink-0 overflow-y-auto border-r border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
          {nav}
        </aside>
        <div className="min-h-0 flex-1 overflow-y-auto bg-zinc-50 dark:bg-zinc-950">
          <div key={pageKey} className="settings-cards mx-auto max-w-3xl space-y-4 p-6">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
