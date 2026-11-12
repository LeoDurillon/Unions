// A file input as a dashed box: drop files on it, or click (or press Enter on it) to browse.
import {
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from 'react';

/** Keeps the files whose name ends with one of `accept`'s extensions (`.pem,.key`); all without it. */
function accepted(files: File[], accept: string | undefined): File[] {
  if (!accept) {
    return files;
  }
  const extensions = accept.split(',').map((extension) => extension.trim().toLowerCase());
  return files.filter((file) =>
    extensions.some((extension) => file.name.toLowerCase().endsWith(extension)),
  );
}

function boxClass(over: boolean, disabled: boolean): string {
  if (disabled) {
    return 'cursor-not-allowed border-zinc-300 opacity-60 dark:border-zinc-700';
  }
  return over
    ? 'cursor-copy border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40'
    : 'cursor-pointer border-zinc-300 hover:border-indigo-400 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900';
}

/** Whether files are dragged over `ref`'s element; hands over the ones dropped on it. */
function useFileDrop(
  ref: RefObject<HTMLElement | null>,
  disabled: boolean,
  onDrop: (files: File[]) => void,
): boolean {
  const [over, setOver] = useState(false);
  useEffect(() => {
    const element = ref.current;
    const enter = (event: DragEvent): void => {
      if (!disabled) {
        event.preventDefault();
        setOver(true);
      }
    };
    const leave = (): void => {
      setOver(false);
    };
    const drop = (event: DragEvent): void => {
      event.preventDefault();
      setOver(false);
      if (!disabled) {
        onDrop([...(event.dataTransfer?.files ?? [])]);
      }
    };
    element?.addEventListener('dragover', enter);
    element?.addEventListener('dragleave', leave);
    element?.addEventListener('drop', drop);
    return (): void => {
      element?.removeEventListener('dragover', enter);
      element?.removeEventListener('dragleave', leave);
      element?.removeEventListener('drop', drop);
    };
  }, [ref, disabled, onDrop]);
  return over && !disabled;
}

/** A file input as a dashed box: drop files on it, or click (or press Enter on it) to browse. */
export function Dropzone({
  label,
  hint,
  multiple = false,
  accept,
  disabled = false,
  onFiles,
}: {
  /** What dropping does, e.g. "Add files"; the box adds "drop here or browse". */
  label: ReactNode;
  /** A line under it: the chosen file, the limits. */
  hint?: ReactNode;
  multiple?: boolean;
  accept?: string;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
}): ReactElement {
  const box = useRef<HTMLLabelElement>(null);
  const hand = (files: File[]): void => {
    const kept = accepted(files, accept);
    if (kept.length > 0) {
      onFiles(multiple ? kept : kept.slice(0, 1));
    }
  };
  const over = useFileDrop(box, disabled, hand);
  return (
    <label
      ref={box}
      className={`relative flex flex-col items-center gap-0.5 rounded-lg border-2 border-dashed px-4 py-3 text-center transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-indigo-500 ${boxClass(over, disabled)}`}
    >
      <input
        type="file"
        className="sr-only"
        multiple={multiple}
        accept={accept}
        disabled={disabled}
        onChange={(event) => {
          const picked = [...(event.target.files ?? [])];
          // Cleared, so picking the same file again fires a change.
          event.target.value = '';
          hand(picked);
        }}
      />
      <span className="text-sm font-medium">
        {label}
        <span className="font-normal text-zinc-500">
          {' '}
          — drop {multiple ? 'them' : 'it'} here or{' '}
          <span className="text-indigo-600 underline dark:text-indigo-400">browse</span>
        </span>
      </span>
      {hint ? <span className="text-xs text-zinc-500">{hint}</span> : null}
    </label>
  );
}
