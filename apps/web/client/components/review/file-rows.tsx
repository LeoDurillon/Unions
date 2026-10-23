// Files as a flat list of paths, or as a folder tree.
import type { ReactElement } from 'react';

import type { DiffFileSummary } from '../../../src/api-types';
import { FileRow } from './file-row';
import { FileTree } from './file-tree';

export type Layout = 'list' | 'tree';

/** How the rows show: the drafts per path, the open file, the layout chosen. */
export type RowOptions = {
  drafts: Map<string, number>;
  selected: number | null;
  onSelect: (id: number) => void;
  layout: Layout;
  /** A short note per path, after its name ("2 hunks" under a part that takes only some). */
  notes?: Map<string, string>;
};

/** Files as a flat list of paths, or as a folder tree. */
export function FileRows({
  files,
  drafts,
  selected,
  onSelect,
  layout,
  notes,
}: RowOptions & { files: DiffFileSummary[] }): ReactElement {
  if (layout === 'tree') {
    return (
      <FileTree
        files={files}
        drafts={drafts}
        selected={selected}
        onSelect={onSelect}
        notes={notes}
      />
    );
  }
  return (
    <ul className="space-y-0.5">
      {files.map((file) => (
        <li key={file.id}>
          <FileRow
            file={file}
            label={file.path}
            drafts={drafts.get(file.path) ?? 0}
            note={notes?.get(file.path)}
            active={file.id === selected}
            onSelect={onSelect}
          />
        </li>
      ))}
    </ul>
  );
}
