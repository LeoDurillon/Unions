import { expect, test } from 'bun:test';

import { jiraCommentOf, jiraCommentProblem, jiraReplyToOf } from './jira-comment-post';

test('a comment Jira would refuse says why', () => {
  expect(jiraCommentProblem('  ')).toBe('Write a comment first');
  expect(jiraCommentProblem('x'.repeat(32_768))).toBe('A comment is at most 32,767 characters');
  expect(jiraCommentProblem(' Thanks ')).toBeNull();
});

test('a reply names the comment and an author to mention; anything less is a new comment', () => {
  const replyTo = { commentId: '10010', accountId: '557058:ada', name: 'Ada Lovelace' };
  expect(jiraReplyToOf(replyTo)).toEqual(replyTo);
  expect(jiraReplyToOf({ ...replyTo, accountId: '' })).toBeNull();
  expect(jiraReplyToOf(null)).toBeNull();
});

test("the command's payload is read back, or refused", () => {
  const payload = { projectId: 1, ticketId: 2, key: 'ABC-1', text: ' Done ', replyTo: null };
  expect(jiraCommentOf(payload)).toEqual({ ...payload, text: 'Done' });
  expect(() => jiraCommentOf({ ...payload, key: '' })).toThrow('needs a "projectId"');
  expect(() => jiraCommentOf({ ...payload, text: '' })).toThrow('needs a "text"');
});
