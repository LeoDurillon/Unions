// The frame of both settings areas: a title, the open page's name and a way back, the menu on the left, the page on the right.
import type { ReactElement, ReactNode } from 'react';

import { Button } from '../ui';

export function SettingsFrame({
  title,
  subtitle,
  pageKey,
  nav,
  onBack,
  children,
}: {
  title: string;
  subtitle: string;
  /** Remounts the page when it changes, so a form starts from what is saved. */
  pageKey: string;
  nav: ReactNode;
  onBack: () => void;
  children: ReactNode;
}): ReactElement {
  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold">{title}</h2>
          <p className="text-xs text-zinc-500">{subtitle}</p>
        </div>
        <Button onClick={onBack}>Back to the board</Button>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="w-56 shrink-0 overflow-y-auto border-r border-zinc-200 p-3 dark:border-zinc-800">
          {nav}
        </aside>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div key={pageKey} className="mx-auto max-w-3xl p-6">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
