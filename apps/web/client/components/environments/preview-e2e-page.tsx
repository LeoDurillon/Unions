// The command a ticket's Preview section runs on request against its preview.

import type { ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { SettingsIntro } from '../settings/settings-intro';
import { TextField } from './preview-fields';
import { PreviewSave, usePreviewForm } from './preview-form';
import { SetUpServicesFirst } from './set-up-services-first';

/** The command a ticket's Preview section runs on request against its preview. */
export function PreviewE2ePage({ project }: { project: PublicProject }): ReactElement {
  const preview = usePreviewForm(project);
  const { value: form, set: setForm } = preview;
  if (!project.config.preview) {
    return <SetUpServicesFirst />;
  }
  return (
    <>
      <SettingsIntro>
        The command that runs the end-to-end tests, on request from a ticket&apos;s Preview tab, in
        its container against its preview.
      </SettingsIntro>
      <section className="space-y-4">
        <TextField
          label="End-to-end tests"
          hint="Optional. Run on request from a ticket's Preview section, in its container against its preview. BASE_URL is the first service by name; UNION_URL_<SERVICE> is each service's public address (UNION_URL_API), which answers in the container too, cookies included. Runs with sh, so it may span several lines."
          value={form.e2eCommand}
          placeholder="npx playwright test"
          multiline
          onChange={(e2eCommand) => {
            setForm({ ...form, e2eCommand });
          }}
        />
        <PreviewSave project={project} form={preview} />
      </section>
    </>
  );
}
