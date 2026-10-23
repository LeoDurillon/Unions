import { useState, type ReactElement } from 'react';

import { reviewBase, reviewSlice } from '../../lib/review-target';
import { CommitDiffBody } from './commit-diff';
import { CommitPicker } from './commit-picker';
import { DiffBody } from './diff-body';
import { ExplainPanel } from './explain-panel';

/**
 * A split ticket's slice: its own change, written on like the whole one. Its commits, the grouping
 * by spec and Explain stay on the whole change.
 */
function SliceArea(props: Omit<Parameters<typeof DiffBody>[0], 'picker'>): ReactElement {
  return (
    <div className="flex min-h-0 flex-1">
      <DiffBody {...props} picker={null} />
    </div>
  );
}

/**
 * The whole change, or one of its commits or the change since the last review (read only), with
 * the Explain panel on the right.
 */
export function DiffArea(props: Omit<Parameters<typeof DiffBody>[0], 'picker'>): ReactElement {
  const [commit, setCommit] = useState<string | null>(null);
  const base = reviewBase(props.target);
  if (reviewSlice(props.target) !== null) {
    return <SliceArea {...props} />;
  }
  const picker = <CommitPicker base={base} value={commit} onChange={setCommit} />;
  return (
    <div className="flex min-h-0 flex-1">
      {commit === null ? (
        <DiffBody {...props} picker={picker} />
      ) : (
        <CommitBody {...props} base={base} commit={commit} picker={picker} onAll={setCommit} />
      )}
      <ExplainPanel paths={new Set(props.files.map((file) => file.path))} />
    </div>
  );
}

function CommitBody({
  target,
  view,
  banner,
  base,
  commit,
  picker,
  onAll,
}: Omit<Parameters<typeof DiffBody>[0], 'picker'> & {
  base: string;
  commit: string;
  picker: ReactElement;
  onAll: (commit: null) => void;
}): ReactElement {
  return (
    <CommitDiffBody
      target={target}
      base={base}
      sha={commit}
      view={view}
      picker={picker}
      banner={banner}
      onAllChanges={() => {
        onAll(null);
      }}
    />
  );
}
