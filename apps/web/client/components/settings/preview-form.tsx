import { useMutation, useQueryClient } from '@tanstack/react-query';
import { exposedServices, type PreviewConfig } from '@union/core/preview';
import { useState, type ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { envLines, parseEnvLines } from '../../lib/env-lines';
import { previewApi } from '../../lib/preview-api';
import { Button, ErrorText } from '../ui';
import { serviceRows, type ServiceRow } from './preview-services-field';

/**
 * The preview settings as the pages edit them. Each page starts from what is saved and saves the
 * whole configuration, so what the other pages hold is sent back unchanged.
 */
export type Form = {
  composeFile: string;
  additions: string;
  rows: ServiceRow[];
  env: string;
  envFileService: string;
  envFilePath: string;
  e2eCommand: string;
  profiles: string[];
  agentServices: string[];
  /** As typed: empty means the default. */
  idleStopMinutes: string;
  maxRunning: string;
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
  idleStopMinutes: '',
  maxRunning: '',
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
    idleStopMinutes: preview.idleStopMinutes === undefined ? '' : String(preview.idleStopMinutes),
    maxRunning: preview.maxRunning === undefined ? '' : String(preview.maxRunning),
  };
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
    ...(form.idleStopMinutes.trim() === ''
      ? {}
      : { idleStopMinutes: Number(form.idleStopMinutes) }),
    ...(form.maxRunning.trim() === '' ? {} : { maxRunning: Number(form.maxRunning) }),
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

/** The page's form, from the saved settings, and its Save (plus "Turn previews off" when asked). */
export function usePreviewForm(
  project: PublicProject,
): [Form, (form: Form) => void, ReturnType<typeof useSave>] {
  const [form, setForm] = useState(() => initial(project));
  return [form, setForm, useSave(project, form)];
}

export function PreviewSave({
  project,
  save,
  canTurnOff = false,
}: {
  project: PublicProject;
  save: ReturnType<typeof useSave>;
  canTurnOff?: boolean;
}): ReactElement {
  return (
    <div className="space-y-2">
      <ErrorText error={save.error} />
      <div className="flex items-center gap-2">
        <Button
          variant="primary"
          disabled={save.isPending}
          onClick={() => {
            save.mutate(true);
          }}
        >
          Save
        </Button>
        {canTurnOff && project.config.preview ? (
          <Button
            disabled={save.isPending}
            onClick={() => {
              save.mutate(false);
            }}
          >
            Turn previews off
          </Button>
        ) : null}
        {save.isSuccess ? <span className="text-xs text-zinc-500">Saved.</span> : null}
      </div>
    </div>
  );
}
