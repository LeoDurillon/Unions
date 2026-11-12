// The top of the Environments tab: the project's previews at a glance. Whether they are on, how many run now, the
// compose file and the profiles turned on.

import type { ReactElement, ReactNode } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { useRunningPreviews } from '../../lib/preview/use-running-previews';

function Card({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <div className="min-w-0 rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-xs text-zinc-500">{label}</p>
      <div className="mt-0.5 min-w-0">{children}</div>
    </div>
  );
}

function OnOff({ on }: { on: boolean }): ReactElement {
  return (
    <span className="flex items-center gap-2 text-[15px] font-semibold">
      <span
        aria-hidden
        className={`size-2.5 rounded-full ${on ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-600'}`}
      />
      {on ? 'On' : 'Off'}
    </span>
  );
}

export function EnvironmentSummary({ project }: { project: PublicProject }): ReactElement {
  const { preview } = project.config;
  const running = (useRunningPreviews().data ?? []).filter(
    (entry) => entry.project.id === project.id,
  ).length;
  const profiles = preview?.profiles ?? [];
  return (
    <section
      aria-label="Previews at a glance"
      className="grid grid-cols-2 gap-3 lg:grid-cols-[1.2fr_1fr_1.4fr_1.4fr]"
    >
      <Card label="Previews">
        <OnOff on={preview !== undefined} />
      </Card>
      <Card label="Running now">
        <span className="text-[15px] font-semibold tabular-nums">{running}</span>
        {running === 0 ? (
          <span className="ml-2 text-xs text-zinc-500">from a ticket&apos;s Preview tab</span>
        ) : null}
      </Card>
      <Card label="Compose file">
        <span className="block truncate font-mono text-[13px] font-medium">
          {preview?.composeFile ?? 'Not set up'}
        </span>
      </Card>
      <Card label="Profiles on">
        {profiles.length === 0 ? (
          <span className="text-[13px] text-zinc-500">None</span>
        ) : (
          <span className="flex flex-wrap gap-1">
            {profiles.map((profile) => (
              <span
                key={profile}
                className="rounded-full bg-indigo-50 px-2 font-mono text-[11.5px] text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300"
              >
                {profile}
              </span>
            ))}
          </span>
        )}
      </Card>
    </section>
  );
}
