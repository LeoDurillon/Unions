import type { PreviewService } from '@union/core';
import type { ReactElement } from 'react';

import type { PreviewSettingsView } from '../../../src/api-types';
import { Button, inputClass } from '../ui';

export type ServiceRow = { name: string; port: string; prefix: string };

function hostOf(prefix: string): string {
  return prefix === '' ? 't<ticket>.union.localhost' : `${prefix}-t<ticket>.union.localhost`;
}

function Row({
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
  return services.map((service) => ({ ...service, port: String(service.port) }));
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
  const missing = (found?.names ?? []).filter((name) => !rows.some((row) => row.name === name));
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Services to open</legend>
      <p className="text-xs text-zinc-500">
        Name in the compose file, port it listens on, and host prefix: none serves it at{' '}
        <code>t&lt;ticket&gt;.union.localhost</code> (the first one is what &quot;Open&quot; goes
        to), <code>api</code> at <code>api-t&lt;ticket&gt;.union.localhost</code>.
      </p>
      {rows.map((row, index) => (
        <Row
          // Rows have no identity of their own: they are edited in place.
          // oxlint-disable-next-line react/no-array-index-key
          key={index}
          row={row}
          onChange={(next) => {
            onChange(rows.map((item, position) => (position === index ? next : item)));
          }}
          onRemove={() => {
            onChange(rows.filter((_item, position) => position !== index));
          }}
        />
      ))}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Button
          onClick={() => {
            onChange([...rows, { name: '', port: '', prefix: rows.length === 0 ? '' : 'api' }]);
          }}
        >
          Add a service
        </Button>
        {found ? (
          <span className="text-zinc-500">
            In the compose file (ticket {found.ticketId}, {new Date(found.at).toLocaleString()}):
          </span>
        ) : null}
        {missing.map((name) => (
          <button
            key={name}
            type="button"
            className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono hover:bg-indigo-100 dark:bg-zinc-800 dark:hover:bg-indigo-950"
            onClick={() => {
              onChange([...rows, { name, port: '', prefix: rows.length === 0 ? '' : name }]);
            }}
          >
            + {name}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
