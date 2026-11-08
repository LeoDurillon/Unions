// Tests of the import rewriting behind the move script: to a moved file, from a moved file, and left alone.
import { expect, test } from 'bun:test';

import { detachHeader, resolveSpecifier, rewriteImports } from './move-files-lib';

const files = new Set([
  'apps/worker/src/e2e.ts',
  'apps/worker/src/preview-env.ts',
  'apps/worker/src/provision.ts',
  'apps/worker/src/preview/run.ts',
  'apps/worker/src/side-review/index.ts',
]);
const moves = new Map([['apps/worker/src/preview-env.ts', 'apps/worker/src/preview/env.ts']]);

test('a specifier resolves with or without extension, and to a folder index', () => {
  expect(resolveSpecifier('apps/worker/src/e2e.ts', './preview-env', files)).toBe(
    'apps/worker/src/preview-env.ts',
  );
  expect(resolveSpecifier('apps/worker/src/e2e.ts', './side-review', files)).toBe(
    'apps/worker/src/side-review/index.ts',
  );
  expect(resolveSpecifier('apps/worker/src/e2e.ts', './missing', files)).toBeNull();
});

test('an import of a moved file points at its new place; others are left as they are', () => {
  const source =
    "import { baseUrl } from './preview-env';\nimport { REPO_DIR } from './provision';\n";
  expect(rewriteImports(source, 'apps/worker/src/e2e.ts', moves, files)).toBe(
    "import { baseUrl } from './preview/env';\nimport { REPO_DIR } from './provision';\n",
  );
});

test("a moved file's own imports are written from its new folder", () => {
  const source = "import { REPO_DIR } from './provision';\nexport { run } from './preview/run';\n";
  expect(rewriteImports(source, 'apps/worker/src/preview-env.ts', moves, files)).toBe(
    "import { REPO_DIR } from '../provision';\nexport { run } from './run';\n",
  );
});

test('the top comment is kept apart from the imports, once', () => {
  const source = "// What it is for.\nimport { a } from './a';\n";
  expect(detachHeader(source)).toBe("// What it is for.\n\nimport { a } from './a';\n");
  expect(detachHeader(detachHeader(source))).toBe(detachHeader(source));
});
