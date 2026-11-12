// A part of the pull requests list (its stacks, the others): its title and count over a card of rows. The
// columns' names go on top when it has them.
import type { ReactElement, ReactNode } from 'react';

export function Part({
  title,
  count,
  header = null,
  children,
}: {
  title: string;
  count: number;
  /** The columns' names, above the rows. */
  header?: ReactNode;
  children: ReactNode;
}): ReactElement {
  return (
    <section aria-label={title} className="px-6 pt-5">
      <h3 className="mb-2.5 text-[13px] font-semibold">
        {title} <span className="font-normal text-zinc-500">{count}</span>
      </h3>
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        {header}
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">{children}</ul>
      </div>
    </section>
  );
}
