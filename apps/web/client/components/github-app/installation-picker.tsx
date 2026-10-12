import { useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import type { InstallationOption } from '../../../src/api-types';
import { api } from '../../lib/api';
import { useGitHubApp } from '../../lib/use-github-app';
import { Badge, Button, ErrorText } from '../ui';
import { AppSetupForm } from './app-setup-form';

const CHOICE_ON = 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40';
const CHOICE_OFF = 'border-zinc-200 hover:border-zinc-400 dark:border-zinc-800';

function InstallationCard({
  installation,
  selected,
  onSelect,
}: {
  installation: InstallationOption;
  selected: boolean;
  onSelect: (installation: InstallationOption) => void;
}): ReactElement {
  return (
    <label
      className={`relative flex cursor-pointer items-center justify-between rounded-lg border p-3 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-indigo-500 ${selected ? CHOICE_ON : CHOICE_OFF}`}
    >
      <input
        type="radio"
        name="github-installation"
        className="sr-only"
        checked={selected}
        onChange={() => {
          onSelect(installation);
        }}
      />
      <span className="text-sm font-medium">{installation.account}</span>
      <Badge tone="neutral">
        {installation.allRepositories ? 'all repositories' : 'selected repositories'}
      </Badge>
    </label>
  );
}

function Installations({
  installUrl,
  selected,
  onSelect,
}: {
  installUrl: string;
  selected: number | null;
  onSelect: (installation: InstallationOption) => void;
}): ReactElement {
  const query = useQuery({
    queryKey: ['github-app', 'installations'],
    queryFn: api.githubApp.installations,
  });
  const installations = query.data ?? [];
  return (
    <div className="space-y-2">
      <ErrorText error={query.error} />
      {query.isPending ? <p className="text-sm text-zinc-500">Loading installations…</p> : null}
      {query.isSuccess && installations.length === 0 ? (
        <p className="text-sm text-zinc-500">The app is not installed anywhere yet.</p>
      ) : null}
      {installations.map((installation) => (
        <InstallationCard
          key={installation.id}
          installation={installation}
          selected={installation.id === selected}
          onSelect={onSelect}
        />
      ))}
      <div className="flex items-center gap-3 text-sm">
        <a
          className="text-indigo-600 underline dark:text-indigo-400"
          href={installUrl}
          target="_blank"
          rel="noreferrer"
        >
          Install on an account
        </a>
        <Button
          disabled={query.isFetching}
          onClick={() => {
            void query.refetch();
          }}
        >
          Refresh
        </Button>
      </div>
    </div>
  );
}

/** Choose where the GitHub App is installed; sets the app up first when it is not configured. */
export function InstallationPicker({
  selected,
  onSelect,
}: {
  selected: number | null;
  onSelect: (installation: InstallationOption) => void;
}): ReactElement {
  const status = useGitHubApp();
  if (status.isPending) {
    return <p className="text-sm text-zinc-500">Loading the GitHub App…</p>;
  }
  if (!status.data?.configured) {
    return (
      <div className="space-y-2">
        <ErrorText error={status.error} />
        <p className="text-sm">No GitHub App is set up yet.</p>
        <AppSetupForm />
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-sm">
        Using <strong>{status.data.name}</strong>. Pick the account that owns the repository.
      </p>
      <Installations
        installUrl={`${status.data.url}/installations/new`}
        selected={selected}
        onSelect={onSelect}
      />
    </div>
  );
}
