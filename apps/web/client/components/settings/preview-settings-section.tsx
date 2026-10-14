import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PreviewConfig } from '@union/core';
import { exposedServices, PREVIEW_TEMPLATES } from '@union/core/preview';
import { useState, type ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { envLines, parseEnvLines } from '../../lib/env-lines';
import { previewApi } from '../../lib/preview-api';
import { Button, ErrorText, Field, inputClass } from '../ui';
import { PreviewSecrets } from './preview-secrets';
import { PreviewServicesField, serviceRows, type ServiceRow } from './preview-services-field';

type Form = {
  composeFile: string;
  rows: ServiceRow[];
  env: string;
  envFileService: string;
  envFilePath: string;
};

function initial(project: PublicProject): Form {
  const { preview } = project.config;
  return {
    composeFile: preview?.composeFile ?? 'compose.yaml',
    rows: preview ? serviceRows(exposedServices(preview)) : [{ name: '', port: '', prefix: '' }],
    env: envLines(preview?.env ?? {}),
    envFileService: preview?.envFile?.service ?? '',
    envFilePath: preview?.envFile?.path ?? '',
  };
}

function TextField({
  label,
  hint,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}): ReactElement {
  return (
    <Field label={label} hint={hint}>
      <input
        className={`${inputClass} font-mono`}
        value={value}
        placeholder={placeholder}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
    </Field>
  );
}

const ENV_HINT = `KEY=value, one per line: given to every service and to \${VAR} in the compose file. Plain values: anyone with access to Union sees them here; use a secret for passwords.`;

function Variables({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}): ReactElement {
  return (
    <Field label="Variables" hint={ENV_HINT}>
      <textarea
        className={`${inputClass} h-32 font-mono text-xs`}
        value={value}
        placeholder="API_URL={service.api.url}"
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
      <span className="flex flex-wrap gap-1">
        {PREVIEW_TEMPLATES.map((template) => (
          <button
            key={template.name}
            type="button"
            title={template.description}
            className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs hover:bg-indigo-100 dark:bg-zinc-800 dark:hover:bg-indigo-950"
            onClick={() => {
              onChange(`${value}{${template.name}}`);
            }}
          >
            {`{${template.name}}`}
          </button>
        ))}
      </span>
    </Field>
  );
}

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

function settingsOf(form: Form): PreviewConfig {
  return {
    composeFile: form.composeFile,
    services: form.rows.map((row) => ({
      name: row.name,
      port: Number(row.port),
      prefix: row.prefix,
    })),
    env: parseEnvLines(form.env),
    ...(form.envFileService.trim() === ''
      ? {}
      : { envFile: { service: form.envFileService, path: form.envFilePath } }),
  };
}

function useSave(
  project: PublicProject,
  form: Form,
): ReturnType<typeof useMutation<unknown, Error, boolean>> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (keep: boolean) =>
      previewApi.saveSettings(project.id, keep ? settingsOf(form) : null),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });
}

function SaveButtons({
  project,
  save,
}: {
  project: PublicProject;
  save: ReturnType<typeof useSave>;
}): ReactElement {
  return (
    <div className="flex gap-2">
      <Button
        variant="primary"
        disabled={save.isPending}
        onClick={() => {
          save.mutate(true);
        }}
      >
        Save
      </Button>
      {project.config.preview ? (
        <Button
          disabled={save.isPending}
          onClick={() => {
            save.mutate(false);
          }}
        >
          Turn previews off
        </Button>
      ) : null}
    </div>
  );
}

/** How the project's tickets run as previews: its compose file, the served services, its variables. */
export function PreviewSettingsSection({ project }: { project: PublicProject }): ReactElement {
  const [form, setForm] = useState(() => initial(project));
  const save = useSave(project, form);
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
      <PreviewServicesField
        rows={form.rows}
        found={settings.data?.composeServices ?? null}
        onChange={(rows) => {
          setForm({ ...form, rows });
        }}
      />
      <Variables
        value={form.env}
        onChange={(env) => {
          setForm({ ...form, env });
        }}
      />
      <EnvFileFields form={form} onChange={setForm} />
      <ErrorText error={save.error} />
      <SaveButtons project={project} save={save} />
      <PreviewSecrets projectId={project.id} names={settings.data?.secretNames ?? []} />
    </section>
  );
}
