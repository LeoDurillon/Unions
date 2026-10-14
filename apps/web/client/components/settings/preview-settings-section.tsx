import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { envLines, parseEnvLines } from '../../lib/env-lines';
import { previewApi } from '../../lib/preview-api';
import { Button, ErrorText, Field, inputClass } from '../ui';

type Form = { composeFile: string; service: string; port: string; env: string };

function initial(project: PublicProject): Form {
  const { preview } = project.config;
  return {
    composeFile: preview?.composeFile ?? 'compose.yaml',
    service: preview?.service ?? '',
    port: preview ? String(preview.port) : '',
    env: envLines(preview?.env ?? {}),
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

function useSave(
  project: PublicProject,
  form: Form,
): ReturnType<typeof useMutation<unknown, Error, boolean>> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (keep: boolean) =>
      previewApi.saveSettings(
        project.id,
        keep
          ? {
              composeFile: form.composeFile,
              service: form.service,
              port: Number(form.port),
              env: parseEnvLines(form.env),
            }
          : null,
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });
}

const ENV_HINT = `KEY=value, one per line: given to every service and to \${VAR} in the compose file. Plain values only for now: anyone with access to Union sees them here.`;

function PreviewFields({
  form,
  onChange,
}: {
  form: Form;
  onChange: (form: Form) => void;
}): ReactElement {
  return (
    <>
      <TextField
        label="Compose file"
        hint="Path in the repository."
        value={form.composeFile}
        placeholder="compose.yaml"
        onChange={(composeFile) => {
          onChange({ ...form, composeFile });
        }}
      />
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Service to open"
          hint="Its name in the compose file."
          value={form.service}
          placeholder="web"
          onChange={(service) => {
            onChange({ ...form, service });
          }}
        />
        <TextField
          label="Port"
          hint="The port it listens on inside its container."
          value={form.port}
          placeholder="3000"
          onChange={(port) => {
            onChange({ ...form, port });
          }}
        />
      </div>
      <Field label="Environment variables" hint={ENV_HINT}>
        <textarea
          className={`${inputClass} h-32 font-mono text-xs`}
          value={form.env}
          placeholder="DATABASE_URL=postgres://postgres:postgres@db:5432/app"
          onChange={(event) => {
            onChange({ ...form, env: event.target.value });
          }}
        />
      </Field>
    </>
  );
}

/** How the project's tickets run as previews: its compose file, the served service, its variables. */
export function PreviewSettingsSection({ project }: { project: PublicProject }): ReactElement {
  const [form, setForm] = useState(() => initial(project));
  const save = useSave(project, form);
  return (
    <section className="space-y-3">
      <p className="text-sm text-zinc-500">
        A ticket&apos;s preview runs the repository&apos;s compose file from the ticket&apos;s
        workspace, as its own environment (its own containers, network and database), and serves one
        service at <code>http://&lt;ticket&gt;.localhost:8080</code>. Containers asking for host
        access, mounting files outside the repository or sharing volumes are refused.
      </p>
      <PreviewFields form={form} onChange={setForm} />
      <ErrorText error={save.error} />
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
    </section>
  );
}
