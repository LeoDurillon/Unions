import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { exposedServices, type PreviewConfig } from '@union/core/preview';
import { useState, type ReactElement } from 'react';

import type { PreviewSettingsView, PublicProject } from '../../../src/api-types';
import { envLines, parseEnvLines } from '../../lib/env-lines';
import { previewApi } from '../../lib/preview-api';
import { Button, ErrorText } from '../ui';
import { PreviewChoicesField } from './preview-choices-field';
import { AdditionsField, PreviewSecrets, TextField, Variables } from './preview-fields';
import { PreviewServicesField, serviceRows, type ServiceRow } from './preview-services-field';

type Form = {
  composeFile: string;
  additions: string;
  rows: ServiceRow[];
  env: string;
  envFileService: string;
  envFilePath: string;
  e2eCommand: string;
  profiles: string[];
  agentServices: string[];
};

const EMPTY: Form = {
  composeFile: 'compose.yaml',
  additions: '',
  rows: [{ name: '', port: '', prefix: '' }],
  env: '',
  envFileService: '',
  envFilePath: '',
  e2eCommand: '',
  profiles: [],
  agentServices: [],
};

function initial(project: PublicProject): Form {
  const { preview } = project.config;
  if (!preview) {
    return EMPTY;
  }
  return {
    composeFile: preview.composeFile,
    additions: preview.composeAdditions ?? '',
    rows: serviceRows(exposedServices(preview)),
    env: envLines(preview.env),
    envFileService: preview.envFile?.service ?? '',
    envFilePath: preview.envFile?.path ?? '',
    e2eCommand: preview.e2eCommand ?? '',
    profiles: preview.profiles ?? [],
    agentServices: preview.agentServices ?? [],
  };
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
    ...(form.additions.trim() === '' ? {} : { composeAdditions: form.additions }),
    services: form.rows.map((row) => ({
      name: row.name,
      port: Number(row.port),
      prefix: row.prefix,
    })),
    env: parseEnvLines(form.env),
    ...(form.envFileService.trim() === ''
      ? {}
      : { envFile: { service: form.envFileService, path: form.envFilePath } }),
    ...(form.e2eCommand.trim() === '' ? {} : { e2eCommand: form.e2eCommand }),
    ...(form.profiles.length === 0 ? {} : { profiles: form.profiles }),
    ...(form.agentServices.length === 0 ? {} : { agentServices: form.agentServices }),
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
      <Variables
        value={form.env}
        onChange={(env) => {
          setForm({ ...form, env });
        }}
      />
      <EnvFileFields form={form} onChange={setForm} />
      <TextField
        label="End-to-end tests"
        hint="Optional. Run on request from a ticket's Preview section, in its container against its preview (BASE_URL is the first service, from inside the environment)."
        value={form.e2eCommand}
        placeholder="npx playwright test"
        onChange={(e2eCommand) => {
          setForm({ ...form, e2eCommand });
        }}
      />
      <ErrorText error={save.error} />
      <SaveButtons project={project} save={save} />
      <PreviewSecrets projectId={project.id} names={settings.data?.secretNames ?? []} />
    </section>
  );
}
