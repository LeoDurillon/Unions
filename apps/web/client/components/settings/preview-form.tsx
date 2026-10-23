import { useMutation, useQueryClient } from '@tanstack/react-query';
import { exposedServices, type AgentVariables, type PreviewConfig } from '@union/core/preview';
import type { ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { envLines, parseEnvLines } from '../../lib/env-lines';
import { previewApi } from '../../lib/preview-api';
import { useSettingsForm, type SettingsForm } from '../../lib/use-settings-form';
import { Button, ErrorText } from '../ui';
import { serviceRows, type ServiceRow } from './preview-services-field';
import { SaveBar } from './save-bar';

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
  startForImplementation: boolean;
  profiles: string[];
  agentServices: string[];
  agentVariables: AgentVariables;
  forwardPorts: boolean;
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
  startForImplementation: false,
  profiles: [],
  agentServices: [],
  agentVariables: { mode: 'all' },
  forwardPorts: true,
  idleStopMinutes: '',
  maxRunning: '',
};

function agentChoices(
  preview: PreviewConfig,
): Pick<Form, 'agentServices' | 'agentVariables' | 'forwardPorts'> {
  return {
    agentServices: preview.agentServices ?? [],
    agentVariables: preview.agentVariables ?? { mode: 'all' },
    forwardPorts: preview.forwardPorts !== false,
  };
}

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
    startForImplementation: preview.startForImplementation === true,
    profiles: preview.profiles ?? [],
    ...agentChoices(preview),
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
    ...(form.startForImplementation ? { startForImplementation: true } : {}),
    ...(form.profiles.length === 0 ? {} : { profiles: form.profiles }),
    ...(form.agentServices.length === 0 ? {} : { agentServices: form.agentServices }),
    ...(form.agentVariables.mode === 'all' ? {} : { agentVariables: form.agentVariables }),
    ...(form.forwardPorts ? {} : { forwardPorts: false }),
    ...(form.idleStopMinutes.trim() === ''
      ? {}
      : { idleStopMinutes: Number(form.idleStopMinutes) }),
    ...(form.maxRunning.trim() === '' ? {} : { maxRunning: Number(form.maxRunning) }),
  };
}

/** The page's form, from the saved settings; its Save writes the whole configuration. */
export function usePreviewForm(project: PublicProject): SettingsForm<Form> {
  return useSettingsForm(
    () => initial(project),
    (form) => previewApi.saveSettings(project.id, settingsOf(form)),
  );
}

/** Applies at once: the form keeps what it holds, unsaved, so Save turns previews on again. */
function TurnOff({
  project,
  form,
}: {
  project: PublicProject;
  form: SettingsForm<Form>;
}): ReactElement | null {
  const queryClient = useQueryClient();
  const turnOff = useMutation({
    mutationFn: () => previewApi.saveSettings(project.id, null),
    onSuccess: async () => {
      form.forgetSaved();
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
  if (!project.config.preview) {
    return null;
  }
  return (
    <>
      <ErrorText error={turnOff.error} />
      <Button
        disabled={turnOff.isPending || form.saving}
        onClick={() => {
          turnOff.mutate();
        }}
      >
        Turn previews off
      </Button>
    </>
  );
}

/** The page's Save bar, plus "Turn previews off" when asked. */
export function PreviewSave({
  project,
  form,
  canTurnOff = false,
}: {
  project: PublicProject;
  form: SettingsForm<Form>;
  canTurnOff?: boolean;
}): ReactElement {
  return (
    <SaveBar state={form} label={project.config.preview ? 'Save' : 'Save and turn previews on'}>
      {canTurnOff ? <TurnOff project={project} form={form} /> : null}
    </SaveBar>
  );
}
