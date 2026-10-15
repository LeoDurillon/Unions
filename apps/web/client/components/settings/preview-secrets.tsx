import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactElement } from 'react';

import type { PreviewSettingsView } from '../../../src/api-types';
import { useLeaveGuard } from '../../lib/leave-guard';
import { previewApi } from '../../lib/preview-api';
import { Button, ErrorText, inputClass } from '../ui';

type Save = (run: () => Promise<PreviewSettingsView>) => void;

function SecretList({
  projectId,
  names,
  save,
}: {
  projectId: number;
  names: string[];
  save: Save;
}): ReactElement {
  return (
    <ul className="flex flex-wrap gap-2">
      {names.map((secret) => (
        <li
          key={secret}
          className="flex items-center gap-1 rounded bg-zinc-100 px-2 py-0.5 font-mono text-xs dark:bg-zinc-800"
        >
          {secret} = ••••
          <button
            type="button"
            className="ml-1 text-red-600 hover:underline dark:text-red-400"
            onClick={() => {
              save(() => previewApi.deleteSecret(projectId, secret));
            }}
          >
            remove
          </button>
        </li>
      ))}
    </ul>
  );
}

function SecretForm({
  projectId,
  busy,
  save,
}: {
  projectId: number;
  busy: boolean;
  save: Save;
}): ReactElement {
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  useLeaveGuard(name.trim() !== '' || value !== '');
  return (
    <div className="grid grid-cols-[12rem_1fr_auto] gap-2">
      <input
        aria-label="Secret name"
        className={`${inputClass} font-mono`}
        value={name}
        placeholder="DB_PASSWORD"
        onChange={(event) => {
          setName(event.target.value);
        }}
      />
      <input
        aria-label="Secret value"
        type="password"
        autoComplete="off"
        className={`${inputClass} font-mono`}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
        }}
      />
      <Button
        disabled={busy || name.trim() === '' || value === ''}
        onClick={() => {
          save(async () => {
            const view = await previewApi.setSecret(projectId, name.trim(), value);
            setName('');
            setValue('');
            return view;
          });
        }}
      >
        Save secret
      </Button>
    </div>
  );
}

/**
 * The project's secret variables: written here, never shown again. Previews get them like the
 * plain ones; the compose file Union shows reads `${NAME}` in their place.
 */
export function PreviewSecrets({
  projectId,
  names,
}: {
  projectId: number;
  names: string[];
}): ReactElement {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (run: () => Promise<PreviewSettingsView>) => run(),
    onSuccess: (view) => {
      queryClient.setQueryData(['preview-settings', projectId], view);
    },
  });
  const save: Save = (run) => {
    mutation.mutate(run);
  };
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Secret variables</legend>
      <p className="text-xs text-zinc-500">
        Given to the services like the others, but never shown again once saved: write a new value
        to change one. Saved and removed one at a time, apart from the page&apos;s Save.
      </p>
      <SecretList projectId={projectId} names={names} save={save} />
      <SecretForm projectId={projectId} busy={mutation.isPending} save={save} />
      <ErrorText error={mutation.error} />
    </fieldset>
  );
}
