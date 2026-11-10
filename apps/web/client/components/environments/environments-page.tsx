// The project's Environments tab: what runs for it now, and how its previews run (compose, variables,
// the agent's environment, shared services, end-to-end tests, limits), a page at a time (`?env=`).

import type { ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import {
  ENVIRONMENT_GUIDE,
  ENVIRONMENT_SECTIONS,
  environmentLabel,
  showEnvironmentSection,
  useEnvironmentSection,
} from '../../lib/environments-url';
import { GuideLink } from '../guide/guide-link';
import { TabButton } from '../tab-button';
import { EnvironmentSectionBody } from './environment-section-body';
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
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <ProjectPreviews projectId={project.id} onOpenTicket={onOpenTicket} />
        <section aria-label="How the previews run" className="space-y-4">
          <div
            role="tablist"
            aria-label="Environment settings"
            className="flex flex-wrap items-center gap-1 border-b border-zinc-200 dark:border-zinc-800"
          >
            {ENVIRONMENT_SECTIONS.map(({ id }) => (
              <TabButton
                key={id}
                tab={id}
                current={section}
                label={environmentLabel(id)}
                onSelect={showEnvironmentSection}
              />
            ))}
            <span className="ml-auto text-xs">
              <GuideLink target={ENVIRONMENT_GUIDE[section]} />
            </span>
          </div>
          <div key={`${project.id}:${section}`}>
            <EnvironmentSectionBody section={section} project={project} />
          </div>
        </section>
      </div>
    </div>
  );
}
