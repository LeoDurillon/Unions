import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { api } from '../../lib/api';
import { Scopes, TokenInput } from '../onboarding/connect-step';
import { Badge, Button, ErrorText } from '../ui';

/** Verifies a new token against GitHub before storing it, so a typo never replaces a working one. */
async function verifyAndSave(
  project: PublicProject,
  token: string,
): Promise<{ login: string; missing: string[] }> {
  const viewer = await api.github.verify(token);
  if (viewer.missingScopes.length === 0) {
    await api.updateProject(project.id, { token });
  }
  return { login: viewer.login, missing: viewer.missingScopes };
}

export function TokenSection({ project }: { project: PublicProject }): ReactElement {
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
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        GitHub token
        <Badge tone={project.hasGithubToken ? 'green' : 'red'}>
          {project.hasGithubToken ? 'set' : 'missing'}
        </Badge>
      </h3>
      <p className="text-xs text-zinc-500">
        Used to clone the repository and mirror tickets to GitHub. Paste a new one to replace it.
      </p>
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
    </section>
  );
}
