// A project's Repository tab: the whole repository at its base branch (or the branch in the URL), read from GitHub.
import { useQueryClient } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { useRepositoryCommit } from '../../lib/repository-api';
import { useRepositoryLocation } from '../../lib/repository-url';
import { ErrorText } from '../ui';
import { CommitLine } from './commit-line';
import { RefPicker } from './ref-picker';
import { RepositoryBrowser } from './repository-browser';

/** The repository at the base branch (or the one picked, `?repo-ref=`), its folders on the left and the picked file on the right. */
export function RepositoryPage({ project }: { project: PublicProject }): ReactElement {
  const { ref, path, setPath, setRef } = useRepositoryLocation();
  const commit = useRepositoryCommit(project.id, ref);
  const queryClient = useQueryClient();
  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['repository', project.id, 'commit'] });
  };
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
        <RefPicker
          projectId={project.id}
          current={ref ?? project.config.baseBranch}
          base={project.config.baseBranch}
          onPick={setRef}
        />
        {commit.data ? (
          <CommitLine commit={commit.data} onRefresh={refresh} />
        ) : (
          <span className="text-xs text-zinc-500">
            {commit.error ? '' : `Reading ${ref ?? project.config.baseBranch}…`}
          </span>
        )}
      </div>
      {commit.error ? (
        <div className="p-4">
          <ErrorText error={commit.error} />
        </div>
      ) : null}
      {commit.data ? (
        <RepositoryBrowser
          projectId={project.id}
          repo={{ owner: project.owner, repo: project.repo }}
          commit={commit.data}
          gitRef={ref}
          path={path}
          onPick={setPath}
        />
      ) : null}
    </div>
  );
}
