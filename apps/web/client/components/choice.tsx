// The app's choice inputs: chips for a multi-select, a switch for on / off, a segmented control for one of a few.
import { useId, type ReactElement, type ReactNode } from 'react';

const FOCUS_RING = 'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-indigo-500';

const CHIP_ON =
  'border-indigo-500 bg-indigo-50 text-indigo-900 dark:bg-indigo-950/50 dark:text-indigo-200';
const CHIP_OFF =
  'border-zinc-300 text-zinc-600 hover:border-zinc-500 dark:border-zinc-700 dark:text-zinc-400';

/** One option of a multi-select, as a pill that shows a check when picked. */
export function CheckChip({
  checked,
  onChange,
  label,
  title,
  mono = false,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** The accessible name, when the visible text is not enough. */
  label?: string;
  title?: string;
  mono?: boolean;
  children: ReactNode;
}): ReactElement {
  return (
    <label
      title={title}
      className={`relative cursor-pointer rounded-full border px-2.5 py-0.5 text-xs transition ${FOCUS_RING} ${mono ? 'font-mono' : ''} ${checked ? CHIP_ON : CHIP_OFF}`}
    >
      <input
        type="checkbox"
        className="sr-only"
        aria-label={label}
        checked={checked}
        onChange={(event) => {
          onChange(event.target.checked);
        }}
      />
      {checked ? '✓ ' : ''}
      {children}
    </label>
  );
}

/** The chips of a multi-select, wrapped. */
export function ChipGroup({ children }: { children: ReactNode }): ReactElement {
  return <div className="flex flex-wrap gap-1.5">{children}</div>;
}

/** Toggles `name` in `selected`, keeping the others. */
export function toggled(selected: string[], name: string, on: boolean): string[] {
  return on ? [...selected, name] : selected.filter((other) => other !== name);
}

/** An on / off setting: a switch, its label, and an optional line under the label. */
export function Switch({
  checked,
  onChange,
  disabled = false,
  hint,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  hint?: ReactNode;
  children: ReactNode;
}): ReactElement {
  return (
    <label
      className={`flex items-start gap-2.5 ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
    >
      <input
        type="checkbox"
        role="switch"
        aria-checked={checked}
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(event) => {
          onChange(event.target.checked);
        }}
      />
      <span
        aria-hidden
        className={`relative mt-0.5 inline-flex h-4 w-7 shrink-0 items-center rounded-full transition peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-500 ${checked ? 'bg-indigo-600' : 'bg-zinc-300 dark:bg-zinc-700'}`}
      >
        <span
          className={`size-3 rounded-full bg-white shadow transition ${checked ? 'translate-x-3.5' : 'translate-x-0.5'}`}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-sm">{children}</span>
        {hint ? <span className="block text-xs text-zinc-500">{hint}</span> : null}
      </span>
    </label>
  );
}

export type SegmentOption<T extends string> = { value: T; label: ReactNode; title?: string };

const SEGMENT_SIZES = { xs: 'px-2.5 py-1 text-xs', sm: 'px-3 py-1 text-sm' } as const;

/** One of a few short options, side by side like tabs. */
export function Segmented<T extends string>({
  legend,
  options,
  value,
  onChange,
  size = 'xs',
}: {
  /** Read by screen readers only. */
  legend: string;
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: keyof typeof SEGMENT_SIZES;
}): ReactElement {
  const name = useId();
  return (
    <fieldset className="inline-flex flex-wrap rounded-md border border-zinc-300 p-0.5 dark:border-zinc-700">
      <legend className="sr-only">{legend}</legend>
      {options.map((option) => (
        <label
          key={option.value}
          title={option.title}
          className={`relative cursor-pointer rounded transition ${FOCUS_RING} ${SEGMENT_SIZES[size]} ${option.value === value ? 'bg-indigo-100 font-medium dark:bg-indigo-950' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'}`}
        >
          <input
            type="radio"
            name={name}
            className="sr-only"
            checked={option.value === value}
            onChange={() => {
              onChange(option.value);
            }}
          />
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}
