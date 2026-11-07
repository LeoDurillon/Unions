// A field naming a tracker's item (a Notion page, a Jira issue): the item is read (its title shown) before it is linked.
import type { UseMutationResult } from '@tanstack/react-query';
import { useState, type ReactElement } from 'react';

import { Button, ErrorText, inputClass } from './ui';

/** An item found by the check: its title and link, and the reference linking it takes. */
export type FoundItem = { ref: string; title: string; url: string };

export function ItemLink({ title, url }: { title: string; url: string }): ReactElement {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
    >
      {title}
    </a>
  );
}

function ConfirmLink({
  found,
  linking,
  onLink,
}: {
  found: FoundItem;
  linking: boolean;
  onLink: (ref: string) => void;
}): ReactElement {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span>
        Link <ItemLink title={found.title} url={found.url} />?
      </span>
      <Button
        variant="primary"
        disabled={linking}
        onClick={() => {
          onLink(found.ref);
        }}
      >
        {linking ? 'Linking…' : 'Link'}
      </Button>
    </div>
  );
}

export function TrackerLinkForm({
  label,
  placeholder,
  check,
  found,
  linking,
  linkError,
  onLink,
  onCancel,
}: {
  /** The field's name for screen readers: "Notion page URL". */
  label: string;
  placeholder: string;
  check: UseMutationResult<unknown, Error, string>;
  /** What the check found, once it has. */
  found: FoundItem | null;
  linking: boolean;
  linkError: Error | null;
  onLink: (ref: string) => void;
  onCancel: (() => void) | null;
}): ReactElement {
  const [value, setValue] = useState('');
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          className={`${inputClass} font-mono`}
          aria-label={label}
          placeholder={placeholder}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            check.reset();
          }}
        />
        <Button
          disabled={value.trim() === '' || check.isPending}
          onClick={() => {
            check.mutate(value.trim());
          }}
        >
          {check.isPending ? 'Reading…' : 'Check'}
        </Button>
        {onCancel ? <Button onClick={onCancel}>Cancel</Button> : null}
      </div>
      {found ? <ConfirmLink found={found} linking={linking} onLink={onLink} /> : null}
      <ErrorText error={check.error ?? linkError} />
    </div>
  );
}
