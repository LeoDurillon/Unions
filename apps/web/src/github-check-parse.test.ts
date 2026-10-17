import { expect, test } from 'bun:test';

import {
  checkRunState,
  MAX_BOT_COMMENTS,
  statusState,
  toBotComments,
  toCheck,
  workflowRunOf,
  type RawComment,
} from './github-check-parse';

test('a run is failed only when the agent could fix it', () => {
  expect(checkRunState('in_progress', null)).toBe('pending');
  expect(checkRunState('completed', 'success')).toBe('passed');
  expect(checkRunState('completed', 'failure')).toBe('failed');
  expect(checkRunState('completed', 'timed_out')).toBe('failed');
  expect(checkRunState('completed', 'cancelled')).toBe('skipped');
  expect(checkRunState('completed', 'skipped')).toBe('skipped');
  expect(statusState('error')).toBe('failed');
  expect(statusState('pending')).toBe('pending');
});

test('an Actions job: its workflow run from its link, its duration', () => {
  const url = 'https://github.com/o/r/actions/runs/38923446864/job/117049715546';
  expect(workflowRunOf(url)).toBe(38_923_446_864);
  expect(workflowRunOf('https://ci.example.com/build/3')).toBeNull();
  expect(
    toCheck({
      id: 117_049_715_546,
      name: 'Fail on findings',
      status: 'completed',
      conclusion: 'failure',
      html_url: url,
      started_at: '2026-10-16T15:24:37Z',
      completed_at: '2026-10-16T15:24:40Z',
      output: { title: null },
    }),
  ).toEqual({
    id: 'run:117049715546',
    name: 'Fail on findings',
    state: 'failed',
    conclusion: 'failure',
    summary: null,
    url,
    workflowRunId: 38_923_446_864,
    durationMs: 3000,
  });
});

function comment(id: number, type: string, updatedAt: string): RawComment {
  return {
    id,
    html_url: `https://x/${id}`,
    updated_at: updatedAt,
    body: `  report ${id}  `,
    user: { login: type === 'Bot' ? 'github-actions[bot]' : 'someone', type },
  };
}

test('bot comments only, the last edited first, trimmed, capped', () => {
  const comments = [
    comment(1, 'Bot', '2026-10-16T10:00:00Z'),
    comment(2, 'User', '2026-10-16T12:00:00Z'),
    comment(3, 'Bot', '2026-10-16T11:00:00Z'),
  ];
  expect(toBotComments(comments).map((one) => [one.id, one.excerpt])).toEqual([
    [3, 'report 3'],
    [1, 'report 1'],
  ]);
  const many = Array.from({ length: MAX_BOT_COMMENTS + 3 }, (_, i) =>
    comment(i, 'Bot', '2026-10-16T10:00:00Z'),
  );
  expect(toBotComments(many)).toHaveLength(MAX_BOT_COMMENTS);
});
