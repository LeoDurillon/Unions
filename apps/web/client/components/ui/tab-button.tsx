// A tab of a tab bar (`role="tab"`): underlined when selected.
import type { ReactElement, ReactNode } from 'react';

export function TabButton<T extends string>({
  tab,
  current,
  label,
  onSelect,
}: {
  tab: T;
  current: T;
  label: ReactNode;
  onSelect: (tab: T) => void;
}): ReactElement {
  const on = tab === current;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={on}
      onClick={() => {
        onSelect(tab);
      }}
      className={`border-b-2 px-3 py-2 text-sm font-medium ${on ? 'border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100' : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'}`}
    >
      {label}
    </button>
  );
}
