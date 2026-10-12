import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactElement } from 'react';

import type { GitHubAccess, InstallationOption, PublicProject } from '../../../src/api-types';
import { api } from '../../lib/api';
import type { Tone } from '../../lib/labels';
import { AccessMethodTabs, type AccessMethod } from '../github-app/access-method';
import { InstallationPicker } from '../github-app/installation-picker';
import { Scopes, TokenInput } from '../onboarding/connect-step';
import { Badge, Button, ErrorText } from '../ui';

const ACCESS_BADGE: Record<GitHubAccess, { tone: Tone; label: string }> = {
  token: { tone: 'green', label: 'personal token' },
  app: { tone: 'green', label: 'GitHub App' },
  none: { tone: 'red', label: 'missing' },
};

/** Verifies a new token against GitHub before storing it, so a typo never replaces a working one. */
async function verifyAndSave(
  project: PublicProject,
  token: string,
): Promise<{ login: string; missing: string[] }> {
  const viewer = await api.github.verify({ token });
  if (viewer.missingScopes.length === 0) {
    await api.updateProject(project.id, { token });
  }
  return { login: viewer.login, missing: viewer.missingScopes };
}

function TokenForm({ project }: { project: PublicProject }): ReactElement {
  const queryClient = useQueryClient();
  const [token, setToken] = useState('');
  const save = useMutation({
    mutationFn: () => verifyAndSave(project, token.trim()),
    onSuccess: async (result) => {
      if (result.missing.length === 0) {
        setToken('');
        await queryClient.invalidateQueries({ queryKey: ['projects'] });
      }
    },
  });
  const saved = save.data?.missing.length === 0 ? save.data.login : null;
  return (
    <div className="space-y-2">
      <TokenInput
        value={token}
        onChange={(value) => {
          setToken(value);
          save.reset();
        }}
      />
      <Button
        variant="primary"
        disabled={token.trim() === '' || save.isPending}
        onClick={() => {
          save.mutate();
        }}
      >
        {save.isPending ? 'Verifying…' : 'Verify and save'}
      </Button>
      <ErrorText error={save.error} />
      <Scopes missing={save.data?.missing ?? []} />
      {saved ? (
        <p className="text-sm text-green-700 dark:text-green-400">Saved. Connected as {saved}.</p>
      ) : null}
    </div>
  );
}

function AppForm({ project }: { project: PublicProject }): ReactElement {
  const queryClient = useQueryClient();
  const [choice, setChoice] = useState<InstallationOption | null>(null);
  const selected = choice?.id ?? project.githubInstallationId;
  const save = useMutation({
    mutationFn: async (installationId: number) => {
      await api.github.verify({ installationId });
      await api.updateProject(project.id, { installationId });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });
  const otherOwner = choice !== null && choice.account !== project.owner;
  return (
    <div className="space-y-2">
      <InstallationPicker
        selected={selected}
        onSelect={(installation) => {
          setChoice(installation);
          save.reset();
        }}
      />
      {otherOwner ? (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          This installation is on {choice.account}, but the repository belongs to {project.owner}.
        </p>
      ) : null}
      <Button
        variant="primary"
        disabled={choice === null || choice.id === project.githubInstallationId || save.isPending}
        onClick={() => {
          if (choice) {
            save.mutate(choice.id);
          }
        }}
      >
        {save.isPending ? 'Saving…' : 'Use this installation'}
      </Button>
      <ErrorText error={save.error} />
      {save.isSuccess ? <p className="text-sm text-green-700 dark:text-green-400">Saved.</p> : null}
    </div>
  );
}

export function GitHubAccessSection({ project }: { project: PublicProject }): ReactElement {
  const [method, setMethod] = useState<AccessMethod>(
    project.githubAccess === 'app' ? 'app' : 'token',
  );
  const badge = ACCESS_BADGE[project.githubAccess];
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        GitHub access
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </h3>
      <p className="text-xs text-zinc-500">
        Used to clone the repository and mirror tickets to GitHub. Saving one kind replaces the
        other.
      </p>
      <AccessMethodTabs method={method} onChange={setMethod} />
      {method === 'token' ? <TokenForm project={project} /> : <AppForm project={project} />}
    </section>
  );
}
