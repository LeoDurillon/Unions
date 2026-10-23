import type { ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { Switch } from '../choice';
import { TextField } from './preview-fields';
import { PreviewSave, usePreviewForm } from './preview-form';
import { SetUpFirst } from './set-up-first';

/** The command a ticket's Preview section runs on request against its preview, and whether the agent gets the preview. */
export function PreviewE2ePage({ project }: { project: PublicProject }): ReactElement {
  const preview = usePreviewForm(project);
  const { value: form, set: setForm } = preview;
  if (!project.config.preview) {
    return (
      <SetUpFirst section="preview-services" what="Choose the compose file and its services" />
    );
  }
  return (
    <section className="space-y-4">
      <TextField
        label="End-to-end tests"
        hint="Optional. Run on request from a ticket's Preview section, in its container against its preview. BASE_URL is the first service by name; UNION_URL_<SERVICE> is each service's public address (UNION_URL_API), which answers in the container too, cookies included."
        value={form.e2eCommand}
        placeholder="npx playwright test"
        onChange={(e2eCommand) => {
          setForm({ ...form, e2eCommand });
        }}
      />
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
