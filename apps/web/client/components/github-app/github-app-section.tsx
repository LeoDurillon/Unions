// The GitHub App every project may use instead of a personal token.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactElement } from 'react';

import type { GitHubAppStatus } from '../../../src/api-types';
import { api } from '../../lib/app/api';
import { useGitHubApp } from '../../lib/settings/use-github-app';
import { SettingsIntro } from '../settings/settings-intro';
import { ConfirmButton } from '../ui/confirm-button';
import { Badge, Button, ErrorText } from '../ui/ui';
import { AppSetupForm } from './app-setup-form';

function InstallationList(): ReactElement {
  const query = useQuery({
    queryKey: ['github-app', 'installations'],
    queryFn: api.githubApp.installations,
  });
  return (
    <div className="space-y-1.5">
      <h4 className="text-sm font-medium">Installed on</h4>
      <ErrorText error={query.error} />
      {query.data?.length === 0 ? (
        <p className="text-sm text-zinc-500">Not installed yet.</p>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
          {(query.data ?? []).map((installation) => (
            <li key={installation.id} className="flex items-center gap-2 px-3 py-2">
              <span className="flex-1 font-medium">{installation.account}</span>
              <Badge tone="neutral">
                {installation.allRepositories ? 'all repositories' : 'selected repositories'}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const LINK_CLASS =
  'rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800';

/** The app's page on GitHub and its install page, opened in a new tab. */
function AppLinks({ url }: { url: string }): ReactElement {
  return (
    <span className="flex flex-wrap gap-2">
      <a className={LINK_CLASS} href={url} target="_blank" rel="noreferrer">
        App page ↗
      </a>
      <a className={LINK_CLASS} href={`${url}/installations/new`} target="_blank" rel="noreferrer">
        Install on an account ↗
      </a>
    </span>
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
    // A card of the settings page itself (`.settings-cards`), not one nested in another.
    <section className="space-y-4">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 className="font-semibold">{app.name}</h3>
        <Badge tone="green">connected</Badge>
        <span className="flex-1 text-xs text-zinc-500">App ID {app.appId}</span>
        <AppLinks url={app.url} />
      </header>
      <InstallationList />
      {replacing ? (
        <AppSetupForm
          onSaved={() => {
            setReplacing(false);
          }}
        />
      ) : null}
      <ErrorText error={remove.error} />
      <div className="flex flex-wrap items-center gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
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
    <>
      <SettingsIntro>
        An alternative to personal tokens: projects pick one of the app’s installations in their
        settings. Issues, comments and pull requests are then authored by the app.
      </SettingsIntro>
      <ErrorText error={status.error} />
      {status.data?.configured ? <ConfiguredApp app={status.data} /> : null}
      {status.data?.configured === false ? (
        <section>
          <AppSetupForm />
        </section>
      ) : null}
    </>
  );
}
