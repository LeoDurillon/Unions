// The services the proxy serves: name in the compose file, port, host prefix, and paths on the
// other services' hosts.

import type { PreviewService } from '@union/core';
import {
  normalizePreviewPath,
  previewPathProblems,
  type PreviewPath,
} from '@union/core/preview-paths';
import type { ReactElement } from 'react';

import type { PreviewSettingsView } from '../../../src/api-types';
import { formatWhen } from '../../lib/ui/relative-time';
import { Button, inputClass } from '../ui/ui';
import { PreviewPathsField, type HostChoice } from './preview-paths-field';

export type ServiceRow = { name: string; port: string; prefix: string; paths: PreviewPath[] };

function hostOf(prefix: string): string {
  return prefix === '' ? 't<ticket>.union.localhost' : `${prefix}-t<ticket>.union.localhost`;
}

/** The hosts of the other services, where this one can also answer under a path. */
function otherHosts(rows: readonly ServiceRow[], row: ServiceRow): HostChoice[] {
  return rows
    .filter((other) => other !== row && other.name.trim() !== '' && other.prefix !== row.prefix)
    .map((other) => ({ prefix: other.prefix, label: `${other.name} (${hostOf(other.prefix)})` }));
}

function Row({
  row,
  hosts,
  onChange,
  onRemove,
}: {
  row: ServiceRow;
  hosts: readonly HostChoice[];
  onChange: (row: ServiceRow) => void;
  onRemove: () => void;
}): ReactElement {
  return (
    <div className="space-y-1">
      <ServiceInputs row={row} onChange={onChange} onRemove={onRemove} />
      <PreviewPathsField
        paths={row.paths}
        hosts={hosts}
        onChange={(paths) => {
          onChange({ ...row, paths });
        }}
      />
    </div>
  );
}

function ServiceInputs({
  row,
  onChange,
  onRemove,
}: {
  row: ServiceRow;
  onChange: (row: ServiceRow) => void;
  onRemove: () => void;
}): ReactElement {
  return (
    <div className="grid grid-cols-[1fr_6rem_1fr_auto] items-center gap-2">
      <input
        aria-label="Service"
        className={`${inputClass} font-mono`}
        value={row.name}
        placeholder="web"
        onChange={(event) => {
          onChange({ ...row, name: event.target.value });
        }}
      />
      <input
        aria-label="Port"
        className={`${inputClass} font-mono`}
        value={row.port}
        placeholder="3000"
        onChange={(event) => {
          onChange({ ...row, port: event.target.value });
        }}
      />
      <input
        aria-label="Host prefix"
        className={`${inputClass} font-mono`}
        value={row.prefix}
        placeholder="(none)"
        title={hostOf(row.prefix)}
        onChange={(event) => {
          onChange({ ...row, prefix: event.target.value });
        }}
      />
      <Button onClick={onRemove}>Remove</Button>
    </div>
  );
}

export function serviceRows(services: PreviewService[]): ServiceRow[] {
  return services.map((service) => ({
    ...service,
    port: String(service.port),
    paths: service.paths ?? [],
  }));
}

/** A row as the settings keep it: its paths only when it has some, each one normalized. */
export function serviceOfRow(row: ServiceRow): PreviewService {
  const paths = row.paths.map((path) => ({ ...path, path: normalizePreviewPath(path.path) }));
  return {
    name: row.name,
    port: Number(row.port),
    prefix: row.prefix,
    ...(paths.length === 0 ? {} : { paths }),
  };
}

/** What the paths cannot be saved for, and that they are not served yet. */
function PathsNotes({ rows }: { rows: readonly ServiceRow[] }): ReactElement | null {
  if (!rows.some((row) => row.paths.length > 0)) {
    return null;
  }
  const problems = previewPathProblems(rows.map((row) => serviceOfRow(row)));
  return (
    <div className="space-y-1 text-xs">
      {problems.map((problem) => (
        <p key={problem} className="text-red-600 dark:text-red-400">
          {problem}
        </p>
      ))}
      <p className="text-amber-700 dark:text-amber-400">
        Paths are saved but not served yet: a later version of Union routes them.
      </p>
    </div>
  );
}

/** Add an empty row, or one for a service the compose file has and the list does not. */
function AddServices({
  rows,
  found,
  onChange,
}: {
  rows: ServiceRow[];
  found: PreviewSettingsView['composeServices'];
  onChange: (rows: ServiceRow[]) => void;
}): ReactElement {
  const missing = (found?.names ?? []).filter((name) => !rows.some((row) => row.name === name));
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <Button
        onClick={() => {
          onChange([
            ...rows,
            { name: '', port: '', prefix: rows.length === 0 ? '' : 'api', paths: [] },
          ]);
        }}
      >
        Add a service
      </Button>
      {found ? (
        <span className="text-zinc-500">
          In the compose file (ticket {found.ticketId}, {formatWhen(found.at)}):
        </span>
      ) : null}
      {missing.map((name) => (
        <button
          key={name}
          type="button"
          className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono hover:bg-indigo-100 dark:bg-zinc-800 dark:hover:bg-indigo-950"
          onClick={() => {
            onChange([
              ...rows,
              { name, port: '', prefix: rows.length === 0 ? '' : name, paths: [] },
            ]);
          }}
        >
          + {name}
        </button>
      ))}
    </div>
  );
}

/** The services the proxy serves: name in the compose file, port, and host prefix. */
export function PreviewServicesField({
  rows,
  found,
  onChange,
}: {
  rows: ServiceRow[];
  found: PreviewSettingsView['composeServices'];
  onChange: (rows: ServiceRow[]) => void;
}): ReactElement {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Services to open</legend>
      <p className="text-xs text-zinc-500">
        Name in the compose file, port it listens on, and host prefix: none serves it at{' '}
        <code>t&lt;ticket&gt;.union.localhost</code> (the first one is what &quot;Open&quot; goes
        to), <code>api</code> at <code>api-t&lt;ticket&gt;.union.localhost</code>. A service can
        also answer under a path of another one&apos;s address: an API at <code>/api</code> of each
        app, as your production proxy serves it.
      </p>
      {rows.map((row, index) => (
        <Row
          // Rows have no identity of their own: they are edited in place.
          // oxlint-disable-next-line react/no-array-index-key
          key={index}
          row={row}
          hosts={otherHosts(rows, row)}
          onChange={(next) => {
            onChange(rows.map((item, position) => (position === index ? next : item)));
          }}
          onRemove={() => {
            onChange(rows.filter((_item, position) => position !== index));
          }}
        />
      ))}
      <AddServices rows={rows} found={found} onChange={onChange} />
      <PathsNotes rows={rows} />
    </fieldset>
  );
}
