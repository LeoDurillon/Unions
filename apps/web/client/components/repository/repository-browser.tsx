// The Repository tab at one commit: the go-to-file box and the folders on the left, the picked file on the right.
import { useState, type ReactElement } from 'react';

import type { RepositoryCommit, RepositoryTree } from '../../../src/repository-api-types';
import { useRepositoryTree } from '../../lib/repository-api';
import { ErrorText } from '../ui';
import { FileViewer } from './file-viewer';
import { RepoFilterBox, RepoFilterResults } from './repo-filter';
import { RepoTreeView } from './repo-tree-view';
import { useRepoTree } from './use-repo-tree';

type Props = {
  projectId: number;
  repo: { owner: string; repo: string };
  commit: RepositoryCommit;
  /** The branch in the URL (null: the base branch), kept on the links of a Markdown file. */
  gitRef: string | null;
  path: string | null;
  onPick: (path: string | null) => void;
};

function Loaded({ tree, ...props }: Props & { tree: RepositoryTree }): ReactElement {
  const { projectId, repo, commit, gitRef, path, onPick } = props;
  const state = useRepoTree(projectId, tree, path);
  const [query, setQuery] = useState('');
  const pick = (next: string): void => {
    onPick(next === '' ? null : next);
  };
  const pickFound = (next: string): void => {
    state.reveal(next);
    setQuery('');
    pick(next);
  };
  const current = path ?? '';
  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-72 shrink-0 flex-col gap-2 overflow-y-auto border-r border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-800 dark:bg-zinc-950">
        <RepoFilterBox value={query} onChange={setQuery} />
        <ErrorText error={state.error} />
        {query.trim() === '' ? (
          <RepoTreeView state={state} selected={path} onPick={pick} />
        ) : (
          <RepoFilterResults
            entries={state.byPath}
            query={query}
            partial={tree.truncated}
            onPick={pickFound}
          />
        )}
      </aside>
      <div className="min-w-0 flex-1 overflow-auto bg-white dark:bg-zinc-900">
        <FileViewer
          base={{
            projectId,
            place: { ...repo, sha: commit.sha },
            ref: gitRef,
            byPath: state.byPath,
          }}
          path={current}
          entry={state.byPath.get(current)}
          index={state.index}
          onPick={pick}
        />
      </div>
    </div>
  );
}

/** The tree at the commit, then the browser over it. */
export function RepositoryBrowser(props: Props): ReactElement {
  const tree = useRepositoryTree(props.projectId, props.commit.treeSha);
  if (tree.error) {
    return (
      <div className="p-4">
        <ErrorText error={tree.error} />
      </div>
    );
  }
  if (!tree.data) {
    return <p className="p-4 text-sm text-zinc-500">Reading the repository…</p>;
  }
  return <Loaded key={props.commit.treeSha} {...props} tree={tree.data} />;
}
