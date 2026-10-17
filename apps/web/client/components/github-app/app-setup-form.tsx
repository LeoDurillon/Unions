import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactElement } from 'react';

import { api } from '../../lib/api';
import { Dropzone } from '../dropzone';
import { Button, ErrorText, Field, inputClass } from '../ui';

/** GitHub pre-fills the app form from these: no webhook, only what Union needs (CI reads for the PR tab). */
const APP_PARAMS = new URLSearchParams({
  url: 'http://localhost:5173',
  public: 'false',
  webhook_active: 'false',
  contents: 'write',
  issues: 'write',
  pull_requests: 'write',
  metadata: 'read',
  checks: 'read',
  statuses: 'read',
  actions: 'write',
  organization_projects: 'write',
});

/** A private app can only be installed on its owner, so the app belongs to the organization. */
function newAppUrl(organization: string): string {
  const name = new URLSearchParams({ name: organization ? `union-${organization}` : 'union' });
  const base = organization
    ? `https://github.com/organizations/${encodeURIComponent(organization)}/settings/apps/new`
    : 'https://github.com/settings/apps/new';
  return `${base}?${name.toString()}&${APP_PARAMS.toString()}`;
}

function CreateAppHelp(): ReactElement {
  const [organization, setOrganization] = useState('');
  return (
    <ol className="list-decimal space-y-2 pl-5 text-xs text-zinc-500">
      <li className="space-y-1">
        <span className="block">
          Create the app under the organization that owns the repositories (leave empty for your own
          account):
        </span>
        <span className="flex gap-2">
          <input
            className={`${inputClass} max-w-48`}
            placeholder="organization"
            aria-label="Organization"
            value={organization}
            onChange={(event) => {
              setOrganization(event.target.value.trim());
            }}
          />
          <a
            className="self-center text-indigo-600 underline dark:text-indigo-400"
            href={newAppUrl(organization)}
            target="_blank"
            rel="noreferrer"
          >
            Create the GitHub App
          </a>
        </span>
        <span className="block">
          Permissions are pre-filled: Contents, Issues and Pull requests read and write, Checks and
          Commit statuses read only (a pull request&apos;s CI checks), Actions read and write (its
          job logs, and re-running a failed job), Projects (organization) read and write, no
          webhook.
        </span>
      </li>
      <li>On the app page, note the App ID and generate a private key (.pem file).</li>
      <li>Paste both below, then install the app on the organization (Install App).</li>
    </ol>
  );
}

async function readFile(file: File | undefined, onRead: (text: string) => void): Promise<void> {
  if (file) {
    onRead(await file.text());
  }
}

function PemInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}): ReactElement {
  return (
    <div className="space-y-1">
      <textarea
        className={`${inputClass} min-h-24 font-mono text-xs`}
        aria-label="Private key"
        placeholder="-----BEGIN RSA PRIVATE KEY-----"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
      <Dropzone
        label="Or load the .pem file"
        accept=".pem"
        onFiles={([picked]) => {
          void readFile(picked, onChange);
        }}
      />
    </div>
  );
}

/** App ID and private key, checked against GitHub before they are stored on the server. */
export function AppSetupForm({ onSaved }: { onSaved?: () => void }): ReactElement {
  const queryClient = useQueryClient();
  const [appId, setAppId] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const save = useMutation({
    mutationFn: () => api.githubApp.save({ appId: appId.trim(), privateKey: privateKey.trim() }),
    onSuccess: async () => {
      setPrivateKey('');
      await queryClient.invalidateQueries({ queryKey: ['github-app'] });
      onSaved?.();
    },
  });
  const ready = appId.trim() !== '' && privateKey.trim() !== '' && !save.isPending;

  return (
    <div className="space-y-3">
      <CreateAppHelp />
      <Field label="App ID">
        <input
          className={`${inputClass} font-mono`}
          inputMode="numeric"
          value={appId}
          onChange={(event) => {
            setAppId(event.target.value);
          }}
        />
      </Field>
      <Field label="Private key" hint="Stays on this machine; never sent back to the browser.">
        <PemInput value={privateKey} onChange={setPrivateKey} />
      </Field>
      <ErrorText error={save.error} />
      <Button
        variant="primary"
        disabled={!ready}
        onClick={() => {
          save.mutate();
        }}
      >
        {save.isPending ? 'Verifying…' : 'Verify and save'}
      </Button>
    </div>
  );
}
