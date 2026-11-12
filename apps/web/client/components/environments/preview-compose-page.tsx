// What runs as a ticket's preview: the compose file, what Union adds to it, and its profiles. Also
// the services opened in the browser.

import type { ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { PreviewChoicesField } from './preview-choices-field';
import { AdditionsField, TextField } from './preview-fields';
import { PreviewSave, usePreviewForm } from './preview-form';
import { PreviewServicesField } from './preview-services-field';
import { useComposeServices } from './use-compose-services';

/** What runs as a ticket's preview: the compose file, what Union adds to it, and what is served. */
export function PreviewComposePage({ project }: { project: PublicProject }): ReactElement {
  const preview = usePreviewForm(project);
  const { value: form, set: setForm } = preview;
  const found = useComposeServices(project.id);
  return (
    <section className="space-y-4">
      <p className="text-sm text-zinc-500">
        A ticket&apos;s preview runs the repository&apos;s compose file from the ticket&apos;s
        workspace, as its own environment (its own containers, network and database). Containers
        asking for host access, mounting files outside the repository or sharing volumes are
        refused.
      </p>
      <TextField
        label="Compose file"
        hint="Path in the repository."
        value={form.composeFile}
        placeholder="compose.yaml"
        onChange={(composeFile) => {
          setForm({ ...form, composeFile });
        }}
      />
      <AdditionsField
        composeFile={form.composeFile}
        value={form.additions}
        onChange={(additions) => {
          setForm({ ...form, additions });
        }}
      />
      <PreviewChoicesField
        label="Profiles"
        hint={
          <>
            Services with a <code>profiles:</code> entry run only when one of their profiles is
            enabled.
          </>
        }
        example="storage, jobs"
        selected={form.profiles}
        known={found?.profiles ?? []}
        onChange={(profiles) => {
          setForm({ ...form, profiles });
        }}
      />
      <PreviewServicesField
        rows={form.rows}
        found={found}
        onChange={(rows) => {
          setForm({ ...form, rows });
        }}
      />
      <PreviewSave project={project} form={preview} canTurnOff />
    </section>
  );
}
