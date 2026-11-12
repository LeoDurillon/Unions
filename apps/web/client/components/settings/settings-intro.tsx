// A settings page's one line under its title, above its cards: what the page is for.

import type { ReactElement, ReactNode } from 'react';

/** Sits under the page title the frame shows, outside the cards. */
export function SettingsIntro({ children }: { children: ReactNode }): ReactElement {
  return <p className="-mt-3 text-sm text-zinc-500 dark:text-zinc-400">{children}</p>;
}
