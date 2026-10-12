import { useMutation } from '@tanstack/react-query';
import { useState, type ReactElement } from 'react';

import { api } from '../../lib/api';
import { AccessMethodTabs } from '../github-app/access-method';
import { InstallationPicker } from '../github-app/installation-picker';
import { Button, ErrorText, Field, inputClass } from '../ui';
import { EMPTY_DRAFT, type StepProps } from './draft';

const TOKEN_URL = 'https://github.com/settings/tokens/new?description=union&scopes=repo,project';

export function Scopes({ missing }: { missing: string[] }): ReactElement | null {
  if (missing.length === 0) {
    return null;
  }
  return (
    <p className="rounded-md bg-amber-50 p-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
      This token is missing the <strong>{missing.join(', ')}</strong> scope. Create one with{' '}
      <code>repo</code> and <code>project</code> access.
    </p>
  );
}

export function TokenInput({
  value,
  onChange,
  placeholder = 'ghp_…',
}: {
  value: string;
  onChange: (value: string) => void;
  /** Shape of the expected secret: GitHub by default. */
  placeholder?: string;
}): ReactElement {
  const [visible, setVisible] = useState(false);
  return (
    <div className="flex gap-2">
      <input
        className={inputClass}
        type={visible ? 'text' : 'password'}
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
      <Button
        onClick={() => {
          setVisible(!visible);
        }}
      >
        {visible ? 'Hide' : 'Show'}
      </Button>
    </div>
  );
}

function TokenConnect({ draft, patch }: StepProps): ReactElement {
  const verify = useMutation({
    mutationFn: () => api.github.verify({ token: draft.token.trim() }),
    onSuccess: (viewer) => {
      patch({ viewer });
    },
  });

  return (
    <div className="space-y-4">
      <Field
        label="Personal access token"
        hint="Needs the repo and project scopes (classic) or the matching repository and project permissions (fine-grained)."
      >
        <TokenInput
          value={draft.token}
          onChange={(token) => {
            patch({ ...EMPTY_DRAFT, token });
            verify.reset();
          }}
        />
      </Field>
      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          disabled={draft.token.trim() === '' || verify.isPending}
          onClick={() => {
            verify.mutate();
          }}
        >
          {verify.isPending ? 'Verifying…' : 'Verify'}
        </Button>
        <a
          className="text-sm text-indigo-600 underline dark:text-indigo-400"
          href={TOKEN_URL}
          target="_blank"
          rel="noreferrer"
        >
          Create a token with the right scopes
        </a>
      </div>
      <ErrorText error={verify.error} />
      {draft.viewer ? (
        <p className="text-sm text-green-700 dark:text-green-400">
          Connected as {draft.viewer.login}.
        </p>
      ) : null}
      <Scopes missing={draft.viewer?.missingScopes ?? []} />
    </div>
  );
}

export function ConnectStep({ draft, patch }: StepProps): ReactElement {
  return (
    <div className="space-y-4">
      <AccessMethodTabs
        method={draft.method}
        onChange={(method) => {
          patch({ ...EMPTY_DRAFT, method });
        }}
      />
      {draft.method === 'token' ? (
        <TokenConnect draft={draft} patch={patch} />
      ) : (
        <InstallationPicker
          selected={draft.installationId}
          onSelect={(installation) => {
            // Listed with the app's own credentials, so the installation needs no further check.
            patch({
              ...EMPTY_DRAFT,
              method: 'app',
              installationId: installation.id,
              viewer: { login: installation.account, missingScopes: [] },
            });
          }}
        />
      )}
    </div>
  );
}
