import { useState, type ReactElement } from 'react';

import { reviewBase } from '../../lib/review-target';
import { CommitDiffBody } from './commit-diff';
import { CommitPicker } from './commit-picker';
import { DiffBody } from './diff-body';

/** The whole change, or (pull requests) one of its commits, read only. */
export function DiffArea(props: Omit<Parameters<typeof DiffBody>[0], 'picker'>): ReactElement {
  const [commit, setCommit] = useState<string | null>(null);
  const { target, view, banner } = props;
  const base = reviewBase(target);
  const picker =
    target.kind === 'pull-request' ? (
      <CommitPicker base={base} value={commit} onChange={setCommit} />
    ) : null;
  if (commit === null) {
    return <DiffBody {...props} picker={picker} />;
  }
  return (
    <CommitDiffBody
      target={target}
      base={base}
      sha={commit}
      view={view}
      picker={picker}
      banner={banner}
      onAllChanges={() => {
        setCommit(null);
      }}
    />
  );
}
