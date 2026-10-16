// Tests a rule's pull request changes: their checks, the description section, and how each is described.
import { expect, test } from 'bun:test';

import {
  checkPullRequestChanges,
  describeChange,
  withRuleSection,
} from './event-pull-request-action';

function check(changes: unknown): unknown {
  return checkPullRequestChanges({ changes });
}

test('the changes are kept trimmed and distinct, in order', () => {
  expect(
    check([
      { kind: 'labels', add: [' qa ', 'qa', ''], remove: ['wip'] },
      { kind: 'reviewers', users: ['@ada', 'grace-h'] },
      { kind: 'title', value: ' [{ticket.id}] {ticket.title} ' },
    ]),
  ).toEqual({
    changes: [
      { kind: 'labels', add: ['qa'], remove: ['wip'] },
      { kind: 'reviewers', users: ['ada', 'grace-h'] },
      { kind: 'title', value: '[{ticket.id}] {ticket.title}' },
    ],
  });
});

test('a change is refused with what is wrong', () => {
  expect(check([])).toEqual({ error: 'Pick what to change on the pull request' });
  expect(check([{ kind: 'milestone' }])).toEqual({
    error: 'Pick what to change on the pull request',
  });
  expect(check([{ kind: 'labels', add: [], remove: [] }])).toEqual({
    error: 'Pick labels to add or remove',
  });
  expect(check([{ kind: 'labels', add: ['qa'], remove: ['qa'] }])).toEqual({
    error: 'The label "qa" is both added and removed',
  });
  expect(check([{ kind: 'labels', add: ['x'.repeat(51)] }])).toMatchObject({
    error: expect.stringContaining('at most 50') as unknown,
  });
  expect(check([{ kind: 'assignees', users: ['not a login'] }])).toEqual({
    error: '"not a login" is not a GitHub login',
  });
  expect(check([{ kind: 'reviewers', users: [] }])).toEqual({ error: 'Pick who reviews' });
  expect(check([{ kind: 'title', value: ' ' }])).toEqual({ error: 'Write the title' });
  expect(check([{ kind: 'description', value: '{pr.link}' }])).toEqual({
    error: 'Unknown variable: {pr.link}',
  });
  expect(
    check([
      { kind: 'assignees', users: ['ada'] },
      { kind: 'assignees', users: ['grace'] },
    ]),
  ).toEqual({ error: 'Assignees: once per rule' });
});

test("the rule's description section is added once, then replaced, the rest kept", () => {
  const first = withRuleSection('Fixes search.', 4, 'QA: ready');
  expect(first).toBe('Fixes search.\n\n<!-- union-rule:4 -->\nQA: ready\n<!-- /union-rule:4 -->');
  expect(withRuleSection(first, 4, 'QA: ready')).toBe(first);
  const edited = `${first}\n\nMore text.`;
  expect(withRuleSection(edited, 4, 'QA: done')).toBe(
    'Fixes search.\n\n<!-- union-rule:4 -->\nQA: done\n<!-- /union-rule:4 -->\n\nMore text.',
  );
  expect(withRuleSection(first, 5, 'Other')).toContain('<!-- union-rule:4 -->');
  expect(withRuleSection('', 4, 'Only')).toBe(
    '<!-- union-rule:4 -->\nOnly\n<!-- /union-rule:4 -->',
  );
});

test('each change says what it did', () => {
  expect(describeChange({ kind: 'labels', add: ['qa', 'ui'], remove: ['wip'] })).toBe(
    'added labels qa, ui, removed labels wip',
  );
  expect(describeChange({ kind: 'reviewers', users: ['ada'] })).toBe('requested reviews from @ada');
  expect(describeChange({ kind: 'title', value: '{ticket.title}' }, 'Search')).toBe(
    'title set to "Search"',
  );
});
