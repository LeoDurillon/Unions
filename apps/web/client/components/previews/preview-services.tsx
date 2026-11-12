// The preview's services: one row each with the preview's state, its port and, while it runs, its address.
// Union records the preview's state, not each service's: a failure names the service in its reason.

import type { Preview } from '@union/core';
import type { PreviewService } from '@union/core/preview';
import type { ReactElement } from 'react';

type Row = { name: string; port: number | null; url: string | null };

const STATE: Record<Preview['status'] | 'none', { label: string; dot: string }> = {
  none: { label: 'Not started', dot: 'bg-zinc-300 dark:bg-zinc-600' },
  starting: { label: 'Starting', dot: 'animate-pulse bg-blue-500' },
  running: { label: 'Running', dot: 'bg-green-500' },
  stopping: { label: 'Stopping', dot: 'animate-pulse bg-blue-500' },
  stopped: { label: 'Stopped', dot: 'bg-zinc-300 dark:bg-zinc-600' },
  failed: { label: 'Not running', dot: 'bg-red-500' },
};

/** The settings' exposed services, with their address while it runs; without settings, the preview's addresses. */
export function serviceRows(services: readonly PreviewService[], preview: Preview | null): Row[] {
  const running = preview?.status === 'running';
  const urls = running ? (preview.urls ?? []) : [];
  const first = running ? preview.url : null;
  const urlOf = (name: string, index: number): string | null =>
    urls.find((entry) => entry.service === name)?.url ?? (index === 0 ? first : null);
  if (services.length > 0) {
    return services.map(({ name, port }, index) => ({ name, port, url: urlOf(name, index) }));
  }
  return (preview?.urls ?? []).map(({ service }, index) => ({
    name: service === '' ? 'app' : service,
    port: null,
    url: urlOf(service, index),
  }));
}

export function PreviewServices({
  services,
  preview,
}: {
  services: readonly PreviewService[];
  preview: Preview | null;
}): ReactElement | null {
  const rows = serviceRows(services, preview);
  if (rows.length === 0) {
    return null;
  }
  const state = STATE[preview?.status ?? 'none'];
  return (
    <ul
      aria-label="Services"
      className="divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800"
    >
      {rows.map((row) => (
        <li key={row.name} className="flex items-center gap-2.5 py-2 text-sm">
          <span aria-hidden className={`size-2 shrink-0 rounded-full ${state.dot}`} />
          <span className="w-32 shrink-0 truncate font-mono text-xs">{row.name}</span>
          <span className="flex-1 text-zinc-500">{state.label}</span>
          {row.url ? (
            <a
              className="min-w-0 truncate text-xs text-indigo-600 hover:underline dark:text-indigo-400"
              href={row.url}
              target="_blank"
              rel="noreferrer"
            >
              {row.url} ↗
            </a>
          ) : null}
          {row.port === null ? null : (
            <span className="shrink-0 font-mono text-xs text-zinc-500">:{row.port}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
