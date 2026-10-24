// The GitHub App every project may use instead of a personal token.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactElement } from 'react';

import type { GitHubAppStatus } from '../../../src/api-types';
import { api } from '../../lib/api';
import { useGitHubApp } from '../../lib/use-github-app';
import { ConfirmButton } from '../confirm-button';
import { Badge, Button, ErrorText } from '../ui';
import { AppSetupForm } from './app-setup-form';

const CARD =
  'space-y-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900';

function InstallationList(): ReactElement {
  const query = useQuery({
    queryKey: ['github-app', 'installations'],
    queryFn: api.githubApp.installations,
  });
  return (
    <div className="space-y-1">
      <h4 className="text-sm font-medium">Installed on</h4>
      <ErrorText error={query.error} />
      <ul className="space-y-1 text-sm">
        {(query.data ?? []).map((installation) => (
          <li key={installation.id} className="flex items-center gap-2">
            {installation.account}
            <Badge tone="neutral">
              {installation.allRepositories ? 'all repositories' : 'selected repositories'}
            </Badge>
          </li>
        ))}
      </ul>
      {query.data?.length === 0 ? (
        <p className="text-sm text-zinc-500">Not installed yet.</p>
      ) : null}
    </div>
  );
}

function AppLinks({ url }: { url: string }): ReactElement {
  return (
    <p className="flex gap-3 text-sm">
      <a
        className="text-indigo-600 underline dark:text-indigo-400"
        href={url}
        target="_blank"
        rel="noreferrer"
      >
        App page
      </a>
      <a
        className="text-indigo-600 underline dark:text-indigo-400"
        href={`${url}/installations/new`}
        target="_blank"
        rel="noreferrer"
      >
        Install on an account
      </a>
    </p>
  );
}

function ConfiguredApp({
  app,
}: {
  app: Extract<GitHubAppStatus, { configured: true }>;
}): ReactElement {
  const queryClient = useQueryClient();
  const [replacing, setReplacing] = useState(false);
  const remove = useMutation({
    mutationFn: api.githubApp.remove,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['github-app'] }),
  });
  return (
    <section className={CARD}>
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">{app.name}</h3>
        <Badge tone="green">connected</Badge>
        <span className="text-xs text-zinc-500">App ID {app.appId}</span>
      </header>
      <AppLinks url={app.url} />
      <InstallationList />
      {replacing ? (
        <AppSetupForm
          onSaved={() => {
            setReplacing(false);
          }}
        />
      ) : null}
      <ErrorText error={remove.error} />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          className="whitespace-nowrap"
          onClick={() => {
            setReplacing(!replacing);
          }}
        >
          {replacing ? 'Cancel' : 'Replace credentials'}
        </Button>
        <ConfirmButton
          label="Remove"
          question="Remove the GitHub App and its key from Union? Projects still using it must switch to a token first."
          confirmLabel="Remove the app"
          disabled={remove.isPending}
          onConfirm={() => {
            remove.mutate();
          }}
        />
      </div>
    </section>
  );
}

/** The GitHub App every project may use instead of a personal token. */
export function GitHubAppSection(): ReactElement {
  const status = useGitHubApp();
  return (
    <div className="space-y-4">
      <header>
        <h3 className="text-sm font-semibold">GitHub App</h3>
        <p className="text-xs text-zinc-500">
          An alternative to personal tokens: projects pick one of the app’s installations in their
          settings. Issues, comments and pull requests are then authored by the app.
        </p>
      </header>
      <ErrorText error={status.error} />
      {status.data?.configured ? <ConfiguredApp app={status.data} /> : null}
      {status.data?.configured === false ? (
        <section className={CARD}>
          <AppSetupForm />
        </section>
      ) : null}
    </div>
  );
}
