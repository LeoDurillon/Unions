import { expect, test } from 'bun:test';

import { buildFileTree, treeOrder, type TreeNode } from './file-tree';

/** The tree as indented lines, directories ending with a slash. */
function outline(nodes: TreeNode<{ path: string }>[], depth = 0): string[] {
  return nodes.flatMap((node) =>
    node.kind === 'dir'
      ? [`${'  '.repeat(depth)}${node.name}/`, ...outline(node.children, depth + 1)]
      : [`${'  '.repeat(depth)}${node.name}`],
  );
}

test('files are grouped by directory, directories first, single-directory chains merged', () => {
  const tree = buildFileTree(
    [
      'README.md',
      'src/pages/lots/index.tsx',
      'src/pages/lots/model.ts',
      'src/app.ts',
      'packages/core/src/deep/only.ts',
    ].map((path) => ({ path })),
  );
  expect(outline(tree)).toEqual([
    'packages/core/src/deep/',
    '  only.ts',
    'src/',
    '  pages/lots/',
    '    index.tsx',
    '    model.ts',
    '  app.ts',
    'README.md',
  ]);
  const [, src] = tree;
  expect(src?.kind === 'dir' && src.children[0]?.kind === 'dir' && src.children[0].path).toBe(
    'src/pages/lots',
  );
});

test('treeOrder lists the files as the tree shows them: folders first, then by name', () => {
  const files = [
    { path: 'b.ts' },
    { path: 'src/z.ts' },
    { path: 'a.ts' },
    { path: 'src/lib/c.ts' },
  ];
  expect(treeOrder(files).map((file) => file.path)).toEqual([
    'src/lib/c.ts',
    'src/z.ts',
    'a.ts',
    'b.ts',
  ]);
});
