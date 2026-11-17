// What runs as a ticket's preview: the compose file, what Union adds to it, and its profiles. Also
// the services opened in the browser.

import type { ReactElement } from 'react';

import type { PreviewSettingsView, PublicProject } from '../../../src/api-types';
import { SettingsIntro } from '../settings/settings-intro';
import { DomainPerPreviewField } from './domain-per-preview-field';
import { PreviewChoicesField } from './preview-choices-field';
import { AdditionsField, TextField } from './preview-fields';
import { PreviewSave, usePreviewForm, type Form } from './preview-form';
import { PreviewServicesField } from './preview-services-field';
import { useComposeServices } from './use-compose-services';

/** The services opened in the browser, and how their addresses are named. */
function ServedServices({
  form,
  found,
  onChange,
}: {
  form: Form;
  found: PreviewSettingsView['composeServices'];
  onChange: (form: Form) => void;
}): ReactElement {
  return (
    <>
      <PreviewServicesField
        rows={form.rows}
        found={found}
        domainPerPreview={form.domainPerPreview}
        onChange={(rows) => {
          onChange({ ...form, rows });
        }}
      />
      <DomainPerPreviewField
        checked={form.domainPerPreview}
        onChange={(domainPerPreview) => {
          onChange({ ...form, domainPerPreview });
        }}
      />
    </>
  );
}

/** What runs as a ticket's preview: the compose file, what Union adds to it, and what is served. */
export function PreviewComposePage({ project }: { project: PublicProject }): ReactElement {
  const preview = usePreviewForm(project);
  const { value: form, set: setForm } = preview;
  const found = useComposeServices(project.id);
  return (
    <>
      <SettingsIntro>
        A ticket&apos;s preview runs the repository&apos;s compose file from the ticket&apos;s
        workspace, as its own environment (its own containers, network and database). Containers
        asking for host access, mounting files outside the repository or sharing volumes are
        refused.
      </SettingsIntro>
      <section className="space-y-4">
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
        <ServedServices form={form} found={found} onChange={setForm} />
        <PreviewSave project={project} form={preview} canTurnOff />
      </section>
    </>
  );
}
