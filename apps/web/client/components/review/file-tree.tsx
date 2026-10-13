import { useMemo, useState, type ReactElement } from 'react';

import type { DiffFileSummary } from '../../../src/api-types';
import { buildFileTree, type TreeNode } from '../../lib/file-tree';
import { FileRow, INDENT, PADDING } from './file-row';

type Props = {
  drafts: Map<string, number>;
  selected: number | null;
  onSelect: (id: number) => void;
};

function DirRow({
  node,
  depth,
  open,
  onToggle,
}: {
  node: Extract<TreeNode<DiffFileSummary>, { kind: 'dir' }>;
  depth: number;
  open: boolean;
  onToggle: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      title={node.path}
      aria-expanded={open}
      onClick={onToggle}
      style={{ paddingLeft: PADDING + depth * INDENT }}
      className="flex w-full items-center gap-2 rounded-md py-1 pr-2 text-left text-xs text-zinc-600 transition hover:bg-zinc-200/70 dark:text-zinc-400 dark:hover:bg-zinc-800"
    >
      <span aria-hidden className="w-3 text-center text-[10px]">
        {open ? '▾' : '▸'}
      </span>
      <span className="min-w-0 flex-1 truncate font-mono">{node.name}/</span>
    </button>
  );
}

function Nodes({
  nodes,
  depth,
  closed,
  toggle,
  ...props
}: Props & {
  nodes: TreeNode<DiffFileSummary>[];
  depth: number;
  closed: Set<string>;
  toggle: (path: string) => void;
}): ReactElement {
  return (
    <ul className="space-y-0.5">
      {nodes.map((node) => {
        if (node.kind === 'file') {
          const { file } = node;
          return (
            <li key={file.id}>
              <FileRow
                file={file}
                label={node.name}
                drafts={props.drafts.get(file.path) ?? 0}
                active={file.id === props.selected}
                depth={depth}
                onSelect={props.onSelect}
              />
            </li>
          );
        }
        const open = !closed.has(node.path);
        return (
          <li key={node.path}>
            <DirRow
              node={node}
              depth={depth}
              open={open}
              onToggle={() => {
                toggle(node.path);
              }}
            />
            {open ? (
              <Nodes
                {...props}
                nodes={node.children}
                depth={depth + 1}
                closed={closed}
                toggle={toggle}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/** The files by directory; every directory starts open and folds on click. */
export function FileTree({ files, ...props }: Props & { files: DiffFileSummary[] }): ReactElement {
  const tree = useMemo(() => buildFileTree(files), [files]);
  const [closed, setClosed] = useState<Set<string>>(() => new Set());
  const toggle = (path: string): void => {
    setClosed((current) => {
      const next = new Set(current);
      if (!next.delete(path)) {
        next.add(path);
      }
      return next;
    });
  };
  return <Nodes {...props} nodes={tree} depth={0} closed={closed} toggle={toggle} />;
}
