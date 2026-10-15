import type { ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { TextField } from './preview-fields';
import { PreviewSave, usePreviewForm } from './preview-form';
import { SetUpFirst } from './set-up-first';

/** The command a ticket's Preview section runs on request against its preview. */
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
        hint="Optional. Run on request from a ticket's Preview section, in its container against its preview (BASE_URL is the first service, from inside the environment)."
        value={form.e2eCommand}
        placeholder="npx playwright test"
        onChange={(e2eCommand) => {
          setForm({ ...form, e2eCommand });
        }}
      />
      <PreviewSave project={project} form={preview} />
    </section>
  );
}
