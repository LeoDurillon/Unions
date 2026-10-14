import { useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import type { PreviewSettingsView, PublicProject } from '../../../src/api-types';
import { previewApi } from '../../lib/preview-api';
import { PreviewChoicesField } from './preview-choices-field';
import { AdditionsField, TextField } from './preview-fields';
import { PreviewSave, usePreviewForm, type Form } from './preview-form';
import { PreviewServicesField } from './preview-services-field';

/** What the compose file offers: the profiles to enable, the services to open and to start for the agent. */
function ComposeChoices({
  form,
  found,
  onChange: setForm,
}: {
  form: Form;
  found: PreviewSettingsView['composeServices'];
  onChange: (form: Form) => void;
}): ReactElement {
  return (
    <>
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
      <PreviewChoicesField
        label="Start for the agent"
        hint="Services that run while the agent implements or rebases (a database for its tests), in the ticket's environment; stopped after each run, their data kept. Its commands get the plain variables."
        example="db, redis"
        selected={form.agentServices}
        known={found?.names ?? []}
        onChange={(agentServices) => {
          setForm({ ...form, agentServices });
        }}
      />
    </>
  );
}

/** What runs as a ticket's preview: the compose file, what Union adds to it, and what is served. */
export function PreviewServicesPage({ project }: { project: PublicProject }): ReactElement {
  const [form, setForm, save] = usePreviewForm(project);
  const settings = useQuery({
    queryKey: ['preview-settings', project.id],
    queryFn: () => previewApi.settings(project.id),
  });
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
      <ComposeChoices
        form={form}
        found={settings.data?.composeServices ?? null}
        onChange={setForm}
      />
      <PreviewSave project={project} save={save} canTurnOff />
    </section>
  );
}
