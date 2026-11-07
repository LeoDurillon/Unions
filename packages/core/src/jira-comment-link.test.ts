import { expect, test } from 'bun:test';

import { isJiraCommentUrl, jiraCommentUrl } from './jira-comment-link';

test("a Jira comment's link is told apart from Notion's and GitHub's", () => {
  const url = jiraCommentUrl('https://acme.atlassian.net', 'ABC-1', '10010');
  expect(url).toBe('https://acme.atlassian.net/browse/ABC-1?focusedCommentId=10010');
  expect(isJiraCommentUrl(url)).toBe(true);
  expect(isJiraCommentUrl('https://acme.atlassian.net/browse/ABC-1')).toBe(false);
  expect(isJiraCommentUrl('https://www.notion.so/p?d=d')).toBe(false);
  expect(isJiraCommentUrl('https://github.com/a/b/pull/1#issuecomment-1')).toBe(false);
  expect(isJiraCommentUrl('https://evil.example/browse/ABC-1?focusedCommentId=1')).toBe(false);
});
