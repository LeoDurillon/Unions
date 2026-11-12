// What the agent gets from the preview's environment: services, variables, ports, and the preview
// itself. That is the services started for its runs, the variables its commands get, their ports on
// its `localhost`, and the preview itself during implementation.

import type { ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { Switch } from '../choice';
import { AgentEnvironment } from './agent-variables-field';
import { PreviewChoicesField } from './preview-choices-field';
import { PreviewSave, usePreviewForm } from './preview-form';
import { SetUpServicesFirst } from './set-up-services-first';
import { useComposeServices } from './use-compose-services';

/** The services, variables and preview the agent works with. */
export function PreviewAgentPage({ project }: { project: PublicProject }): ReactElement {
  const preview = usePreviewForm(project);
  const { value: form, set: setForm } = preview;
  const found = useComposeServices(project.id);
  if (!project.config.preview) {
    return <SetUpServicesFirst />;
  }
  return (
    <section className="space-y-4">
      <PreviewChoicesField
        label="Start for the agent"
        hint="Services that run while the agent implements or rebases (a database for its tests), and while you run a command from a ticket, in the ticket's environment; stopped after each run, their data kept."
        example="db, redis"
        selected={form.agentServices}
        known={found?.names ?? []}
        onChange={(agentServices) => {
          setForm({ ...form, agentServices });
        }}
      />
      {form.agentServices.length > 0 ? <AgentEnvironment form={form} onChange={setForm} /> : null}
      <div className="space-y-1">
        <Switch
          checked={form.startForImplementation}
          onChange={(startForImplementation) => {
            setForm({ ...form, startForImplementation });
          }}
        >
          <span className="font-medium">Start the preview for implementation steps</span>
        </Switch>
        <p className="text-xs text-zinc-500">
          The ticket&apos;s preview starts before the agent implements or revises, so it can try its
          work in a browser and run the end-to-end tests it touches. It counts toward the running
          limit and stops when idle once the step ends.
        </p>
      </div>
      <PreviewSave project={project} form={preview} />
    </section>
  );
}
