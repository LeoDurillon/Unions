// The New ticket dialog's footer: a bar along its bottom edge with Cancel and Create ticket, and its Ctrl+Enter.

import type { KeyboardEvent, ReactElement } from 'react';

import { Button } from '../ui/ui';

/** The keys that create the ticket from anywhere in the form, as this computer names them. */
function submitKeys(): string {
  return /Mac|iPhone|iPad/u.test(navigator.userAgent) ? '⌘ ↵' : 'Ctrl ↵';
}

function submitLabel(pending: boolean, created: boolean): string {
  if (pending) {
    return 'Creating…';
  }
  return created ? 'Upload the files and open the ticket' : 'Create ticket';
}

/** Ctrl+Enter (⌘+Enter on a Mac) in a field of the form creates the ticket. */
export function submitOnModEnter(
  event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
): void {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }
}

export function FormFooter({
  pending,
  created,
  onCancel,
}: {
  pending: boolean;
  /** The ticket exists but a file failed to upload: submitting again sends the files. */
  created: boolean;
  onCancel: () => void;
}): ReactElement {
  return (
    <div className="-mx-6 -mb-6 flex justify-end gap-2 rounded-b-2xl border-t border-zinc-200 bg-zinc-50 px-6 py-3 dark:border-zinc-800 dark:bg-zinc-950">
      <Button onClick={onCancel}>Cancel</Button>
      <Button type="submit" variant="primary" disabled={pending}>
        {submitLabel(pending, created)}
        <kbd className="ml-2 font-sans font-normal opacity-70">{submitKeys()}</kbd>
      </Button>
    </div>
  );
}
