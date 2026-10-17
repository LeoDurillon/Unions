// A part of a list of pull requests (its stacks, the others): a heading with its count over its rows.
import type { ReactElement, ReactNode } from 'react';

export function Part({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}): ReactElement {
  return (
    <section aria-label={title}>
      <h3 className="border-y border-zinc-200 bg-zinc-100 px-4 py-1.5 text-xs font-semibold tracking-wide text-zinc-600 uppercase dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
        {title} · {count}
      </h3>
      <ul>{children}</ul>
    </section>
  );
}
