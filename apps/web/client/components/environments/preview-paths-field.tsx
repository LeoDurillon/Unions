// An exposed service's further addresses: paths on other exposed services' hosts, path removed or not.
// For an API at /api on each front end's address, as a production reverse proxy serves it.

import type { PreviewPath } from '@union/core/preview-paths';
import type { ReactElement } from 'react';

import { Button, inputClass } from '../ui/ui';

/** A host the user can pick: an exposed service's prefix, and how it reads. */
export type HostChoice = { prefix: string; label: string };

function PathRow({
  path,
  hosts,
  onChange,
  onRemove,
}: {
  path: PreviewPath;
  hosts: readonly HostChoice[];
  onChange: (path: PreviewPath) => void;
  onRemove: () => void;
}): ReactElement {
  const known = hosts.some((host) => host.prefix === path.host);
  return (
    <div className="grid grid-cols-[auto_1fr_8rem_auto_auto] items-center gap-2 text-xs">
      <span className="text-zinc-500">also at</span>
      <select
        aria-label="Host"
        className={inputClass}
        value={path.host}
        onChange={(event) => {
          onChange({ ...path, host: event.target.value });
        }}
      >
        {known ? null : <option value={path.host}>{path.host || '(main host)'}</option>}
        {hosts.map((host) => (
          <option key={host.prefix} value={host.prefix}>
            {host.label}
          </option>
        ))}
      </select>
      <input
        aria-label="Path"
        className={`${inputClass} font-mono`}
        value={path.path}
        placeholder="/api"
        onChange={(event) => {
          onChange({ ...path, path: event.target.value });
        }}
      />
      <label
        className="flex items-center gap-1 whitespace-nowrap"
        title="Ticked, /api/users reaches the service as /users"
      >
        <input
          type="checkbox"
          checked={path.strip}
          onChange={(event) => {
            onChange({ ...path, strip: event.target.checked });
          }}
        />
        Remove the path
      </label>
      <Button onClick={onRemove}>Remove</Button>
    </div>
  );
}

/** The paths a service also answers under, on the other exposed services' hosts. */
export function PreviewPathsField({
  paths,
  hosts,
  onChange,
}: {
  paths: PreviewPath[];
  hosts: readonly HostChoice[];
  onChange: (paths: PreviewPath[]) => void;
}): ReactElement | null {
  const [first] = hosts;
  if (paths.length === 0 && first === undefined) {
    return null;
  }
  return (
    <div className="space-y-1 pl-4">
      {paths.map((path, index) => (
        <PathRow
          // Rows have no identity of their own: they are edited in place.
          // oxlint-disable-next-line react/no-array-index-key
          key={index}
          path={path}
          hosts={hosts}
          onChange={(next) => {
            onChange(paths.map((item, position) => (position === index ? next : item)));
          }}
          onRemove={() => {
            onChange(paths.filter((_item, position) => position !== index));
          }}
        />
      ))}
      {first === undefined ? null : (
        <button
          type="button"
          className="text-xs text-indigo-600 hover:underline dark:text-indigo-400"
          onClick={() => {
            onChange([...paths, { host: first.prefix, path: '/api', strip: true }]);
          }}
        >
          + Also serve at a path of another service&apos;s address
        </button>
      )}
    </div>
  );
}
