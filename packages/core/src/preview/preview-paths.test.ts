// Tests for the paths an exposed service also answers under on other services' hosts.
import { expect, test } from 'bun:test';

import type { PreviewService } from '../schema/schema-types';
import {
  normalizePreviewPath,
  parsePreviewPaths,
  previewPathProblem,
  previewPathProblems,
} from './preview-paths';

const EDITOR: PreviewService = { name: 'editor', port: 3001, prefix: '' };
const VIEWER: PreviewService = { name: 'viewer', port: 3002, prefix: 'viewer' };

function api(paths: PreviewService['paths']): PreviewService {
  return { name: 'api', port: 3000, prefix: 'api', paths };
}

test('a path is read trimmed, lower-case host, without its final slash, stripped by default', () => {
  expect(
    parsePreviewPaths(
      [
        { host: ' Viewer ', path: ' /api/ ' },
        { host: '', path: '/api/v2', strip: false },
      ],
      'api',
    ),
  ).toEqual([
    { host: 'viewer', path: '/api', strip: true },
    { host: '', path: '/api/v2', strip: false },
  ]);
  expect(parsePreviewPaths(undefined, 'api')).toEqual([]);
  expect(normalizePreviewPath('/')).toBe('/');
});

test('the root, a relative path, a pattern or a rule character is refused', () => {
  expect(previewPathProblem('/')).toContain('below the root');
  expect(previewPathProblem('')).toContain('below the root');
  for (const path of ['api', '/api/*', '/a`)', '/a b', '/a//b', '/api?x=1']) {
    expect(previewPathProblem(path)).toContain('must start with /');
  }
  expect(previewPathProblem('/api.v1/_~-x')).toBeNull();
  expect(() => parsePreviewPaths([{ host: '', path: '/' }], 'api')).toThrow('api: give a path');
  expect(() => parsePreviewPaths({ host: '' }, 'api')).toThrow('as a list');
});

test('a path on another exposed service is fine, and one path inside another too', () => {
  expect(
    previewPathProblems([
      EDITOR,
      VIEWER,
      api([
        { host: '', path: '/api', strip: true },
        { host: 'viewer', path: '/api', strip: true },
        { host: 'viewer', path: '/api/v2', strip: false },
      ]),
    ]),
  ).toEqual([]);
});

test('its own host, an unknown host and a host and path given twice are refused', () => {
  expect(previewPathProblems([EDITOR, api([{ host: 'api', path: '/x', strip: true }])])).toEqual([
    'api answers on its own host at every path already',
  ]);
  expect(previewPathProblems([EDITOR, api([{ host: 'admin', path: '/x', strip: true }])])).toEqual([
    'api: no exposed service has the host prefix "admin"',
  ]);
  const files: PreviewService = {
    name: 'files',
    port: 9000,
    prefix: 'files',
    paths: [{ host: '', path: '/api', strip: true }],
  };
  expect(
    previewPathProblems([EDITOR, files, api([{ host: '', path: '/api', strip: true }])]),
  ).toEqual(["/api on editor's host is given twice"]);
});
