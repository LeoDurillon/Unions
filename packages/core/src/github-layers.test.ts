import { expect, test } from 'bun:test';

import { hasGitHubProject, mirrorsIssues } from './github-layers';

const none = { githubProjectNodeId: '', githubProjectUrl: null, config: { baseBranch: 'main' } };

test('a project has a GitHub Project from its node id or its unresolved URL', () => {
  expect(hasGitHubProject(none)).toBe(false);
  expect(hasGitHubProject({ ...none, githubProjectUrl: '' })).toBe(false);
  expect(hasGitHubProject({ ...none, githubProjectNodeId: 'P_1' })).toBe(true);
  expect(
    hasGitHubProject({ ...none, githubProjectUrl: 'https://github.com/users/o/projects/1' }),
  ).toBe(true);
});

test('issues are mirrored by default, off only without a Project', () => {
  expect(mirrorsIssues(none)).toBe(true);
  const off = { ...none, config: { baseBranch: 'main', mirrorIssues: false } };
  expect(mirrorsIssues(off)).toBe(false);
  expect(mirrorsIssues({ ...off, githubProjectNodeId: 'P_1' })).toBe(true);
});
