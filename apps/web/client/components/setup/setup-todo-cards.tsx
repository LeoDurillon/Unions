// The setup proposal's to-dos: secret values and files only the user can give. They are written
// through the settings' own endpoints.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SetupProjectFile, SetupSecret } from '@union/core';
import { useState, type ReactElement } from 'react';

import { previewApi } from '../../lib/preview/preview-api';
import { projectFilesApi } from '../../lib/project-files-api';
import { Badge, Button, ErrorText, inputClass } from '../ui';
import { SetupCard } from './setup-card';
import type { SetupCardProps } from './setup-card-props';

function SecretRow({
  projectId,
  secret,
  set,
}: {
  projectId: number;
  secret: SetupSecret;
  set: boolean;
}): ReactElement {
  const queryClient = useQueryClient();
  const [value, setValue] = useState('');
  const save = useMutation({
    mutationFn: () => previewApi.setSecret(projectId, secret.name, value),
    onSuccess: (view) => {
      setValue('');
      queryClient.setQueryData(['preview-settings', projectId], view);
    },
  });
  return (
    <div className="space-y-1">
      <p className="text-xs">
        <code className="font-medium">{secret.name}</code>{' '}
        {set ? <Badge tone="green">Set</Badge> : null}{' '}
        <span className="text-zinc-500">{secret.where}</span>
      </p>
      <div className="flex gap-2">
        <input
          type="password"
          autoComplete="off"
          aria-label={`Value of ${secret.name}`}
          className={`${inputClass} font-mono text-xs`}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
          }}
        />
        <Button
          size="sm"
          disabled={value === '' || save.isPending}
          onClick={() => {
            save.mutate();
          }}
        >
          {set ? 'Replace' : 'Save'}
        </Button>
      </div>
      <ErrorText error={save.error} />
    </div>
  );
}

export function SecretsCard({
  project,
  dismissed,
  onDismiss,
  secrets,
}: SetupCardProps & { secrets: readonly SetupSecret[] }): ReactElement {
  const settings = useQuery({
    queryKey: ['preview-settings', project.id],
    queryFn: () => previewApi.settings(project.id),
  });
  const names = settings.data?.secretNames ?? [];
  const applied = secrets.every((secret) => names.includes(secret.name));
  return (
    <SetupCard
      title="Secret variables"
      why="Values the agent must not see or write: enter each one. Union keeps them on the server and never shows them again."
      state={{ applied, dismissed, pending: false, error: settings.error }}
      onDismiss={onDismiss}
    >
      {secrets.map((secret) => (
        <SecretRow
          key={secret.name}
          projectId={project.id}
          secret={secret}
          set={names.includes(secret.name)}
        />
      ))}
    </SetupCard>
  );
}

function FileRow({
  projectId,
  file,
  given,
}: {
  projectId: number;
  file: SetupProjectFile;
  given: boolean;
}): ReactElement {
  const queryClient = useQueryClient();
  const upload = useMutation({
    mutationFn: (chosen: File) => projectFilesApi.upload(projectId, file.path, chosen),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['project-files', projectId] }),
  });
  return (
    <div className="space-y-1">
      <p className="text-xs">
        <code className="font-medium">{file.path}</code>{' '}
        {given ? <Badge tone="green">Given</Badge> : null}{' '}
        <span className="text-zinc-500">{file.what}</span>
      </p>
      <input
        type="file"
        aria-label={`Upload ${file.path}`}
        className="text-xs"
        disabled={upload.isPending}
        onChange={(event) => {
          const chosen = event.target.files?.[0];
          if (chosen) {
            upload.mutate(chosen);
          }
        }}
      />
      {upload.isPending ? <p className="text-xs text-zinc-500">Uploading…</p> : null}
      <ErrorText error={upload.error} />
    </div>
  );
}

export function ProjectFilesCard({
  project,
  dismissed,
  onDismiss,
  files,
}: SetupCardProps & { files: readonly SetupProjectFile[] }): ReactElement {
  const list = useQuery({
    queryKey: ['project-files', project.id],
    queryFn: () => projectFilesApi.list(project.id),
  });
  const paths = new Set((list.data ?? []).map((file) => file.path));
  return (
    <SetupCard
      title="Project files"
      why="Files the checkout needs that git does not hold. Each one is put at its path in every ticket's workspace and kept out of git."
      state={{
        applied: files.every((file) => paths.has(file.path)),
        dismissed,
        pending: false,
        error: list.error,
      }}
      onDismiss={onDismiss}
    >
      {files.map((file) => (
        <FileRow key={file.path} projectId={project.id} file={file} given={paths.has(file.path)} />
      ))}
    </SetupCard>
  );
}
