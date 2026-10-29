// A "⋯" button opening a short list of less frequent actions; a choice, Escape or a click outside closes it.
import { useEffect, useRef, useState, type ReactElement, type RefObject } from 'react';

export type MenuItem = {
  label: string;
  onSelect: () => void;
  /** Why it cannot be chosen now; null when it can. */
  refusal?: string | null;
  danger?: boolean;
};

function itemClass(danger: boolean): string {
  const tone = danger ? 'text-red-600 dark:text-red-400' : 'text-zinc-700 dark:text-zinc-200';
  return `block w-full px-3 py-1.5 text-left text-sm hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-zinc-800 ${tone}`;
}

/** The open list: Escape or a click outside `root` (the button and the list) closes it. */
function MenuPanel({
  root,
  items,
  onClose,
}: {
  root: RefObject<HTMLDivElement | null>;
  items: MenuItem[];
  onClose: () => void;
}): ReactElement {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    const onPointer = (event: PointerEvent): void => {
      if (event.target instanceof Node && root.current?.contains(event.target) !== true) {
        onClose();
      }
    };
    globalThis.addEventListener('keydown', onKey);
    globalThis.addEventListener('pointerdown', onPointer);
    return () => {
      globalThis.removeEventListener('keydown', onKey);
      globalThis.removeEventListener('pointerdown', onPointer);
    };
  }, [root, onClose]);
  return (
    <div
      role="menu"
      className="absolute right-0 z-10 mt-1 min-w-44 rounded-md border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          className={itemClass(item.danger === true)}
          disabled={(item.refusal ?? null) !== null}
          title={item.refusal ?? undefined}
          onClick={() => {
            onClose();
            item.onSelect();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

/** A "⋯" button opening a short list of less frequent actions. */
export function OverflowMenu({ label, items }: { label: string; items: MenuItem[] }): ReactElement {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        title={label}
        className="rounded-md px-2 py-1 text-sm leading-none text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
        onClick={() => {
          setOpen(!open);
        }}
      >
        ⋯
      </button>
      {open ? (
        <MenuPanel
          root={root}
          items={items}
          onClose={() => {
            setOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
