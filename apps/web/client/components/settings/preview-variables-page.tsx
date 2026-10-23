// What every service of a preview gets: plain variables, secrets, and the variables as a file.
import { useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { previewApi } from '../../lib/preview-api';
import { TextField, Variables } from './preview-fields';
import { PreviewSave, usePreviewForm, type Form } from './preview-form';
import { PreviewSecrets } from './preview-secrets';
import { SetUpFirst } from './set-up-first';

function EnvFileFields({
  form,
  onChange,
}: {
  form: Form;
  onChange: (form: Form) => void;
}): ReactElement {
  return (
    <div className="grid grid-cols-2 gap-3">
      <TextField
        label="Variables as a file: service"
        hint="Optional, for apps that read a file. Leave empty for none."
        value={form.envFileService}
        placeholder="web"
        onChange={(envFileService) => {
          onChange({ ...form, envFileService });
        }}
      />
      <TextField
        label="Path inside it"
        hint="Absolute, and outside the folders mounted from the repository."
        value={form.envFilePath}
        placeholder="/app/.env.production"
        onChange={(envFilePath) => {
          onChange({ ...form, envFilePath });
        }}
      />
    </div>
  );
}

/** What every service of a preview gets: plain variables, secrets, and the variables as a file. */
export function PreviewVariablesPage({ project }: { project: PublicProject }): ReactElement {
  const preview = usePreviewForm(project);
  const { value: form, set: setForm } = preview;
  const settings = useQuery({
    queryKey: ['preview-settings', project.id],
    queryFn: () => previewApi.settings(project.id),
  });
  if (!project.config.preview) {
    return (
      <SetUpFirst section="preview-services" what="Choose the compose file and its services" />
    );
  }
  return (
    <section className="space-y-4">
      <Variables
        value={form.env}
        onChange={(env) => {
          setForm({ ...form, env });
        }}
      />
      <EnvFileFields form={form} onChange={setForm} />
      <PreviewSecrets projectId={project.id} names={settings.data?.secretNames ?? []} />
      <PreviewSave project={project} form={preview} />
    </section>
  );
}
