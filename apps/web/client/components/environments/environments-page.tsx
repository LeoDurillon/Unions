// The project's Environments tab: its previews at a glance, what runs now, and how its previews run. The setting
// pages (`?env=`) are listed on the left: compose, variables, the agent's environment, shared services, end-to-end
// tests, limits.

import type { ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import {
  ENVIRONMENT_GUIDE,
  ENVIRONMENT_SECTIONS,
  environmentLabel,
  showEnvironmentSection,
  useEnvironmentSection,
} from '../../lib/settings/environments-url';
import { GuideLink } from '../guide/guide-link';
import { EnvironmentSectionBody } from './environment-section-body';
import { EnvironmentSummary } from './environment-summary';
import { ProjectPreviews } from './project-previews';

/** What runs for the project now, then how its previews run, a page at a time. */
export function EnvironmentsPage({
  project,
  onOpenTicket,
}: {
  project: PublicProject;
  onOpenTicket: (ticketId: number) => void;
}): ReactElement {
  const section = useEnvironmentSection();
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-6 p-6">
        <EnvironmentSummary project={project} />
        <ProjectPreviews projectId={project.id} onOpenTicket={onOpenTicket} />
        <section
          aria-label="How the previews run"
          className="grid gap-6 md:grid-cols-[12rem_minmax(0,1fr)]"
        >
          <nav
            aria-label="Environment settings"
            className="flex flex-col gap-0.5 max-md:flex-row max-md:flex-wrap"
          >
            {ENVIRONMENT_SECTIONS.map(({ id }) => (
              <button
                key={id}
                type="button"
                aria-current={id === section ? 'page' : undefined}
                onClick={() => {
                  showEnvironmentSection(id);
                }}
                className={`rounded-lg px-3 py-1.5 text-left text-[13px] transition ${id === section ? 'bg-white font-semibold text-zinc-900 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-800' : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100'}`}
              >
                {environmentLabel(id)}
              </button>
            ))}
            <span className="mt-3 px-3 text-xs">
              <GuideLink target={ENVIRONMENT_GUIDE[section]} />
            </span>
          </nav>
          <div key={`${project.id}:${section}`} className="min-w-0 space-y-4">
            <h2 className="text-[15px] font-semibold">{environmentLabel(section)}</h2>
            <EnvironmentSectionBody
              section={section}
              project={project}
              onOpenTicket={onOpenTicket}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
