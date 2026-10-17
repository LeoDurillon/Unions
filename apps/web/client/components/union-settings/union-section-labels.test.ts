import { expect, test } from 'bun:test';

import { isUnionSection, menuIndex, UNION_SETTINGS_GROUPS } from '../../lib/union-settings-groups';
import { AGENT_LABELS } from '../agents/agent-labels';
import { unionSectionLabel } from './union-section-labels';

test('every agent has a page in the Union settings', () => {
  expect(Object.keys(AGENT_LABELS).filter((agent) => !isUnionSection(agent))).toEqual([]);
});

test('no page is listed twice', () => {
  const sections = UNION_SETTINGS_GROUPS.flatMap((group): readonly string[] => group.sections);
  expect(new Set(sections).size).toBe(sections.length);
});

test('an unknown or missing section is not one', () => {
  expect(isUnionSection('agents')).toBe(false);
  expect(isUnionSection(null)).toBe(false);
});

test('agents are named by their title, the other pages by their own name', () => {
  expect(unionSectionLabel('test_plan')).toBe('Test plan');
  expect(unionSectionLabel('github-app')).toBe('GitHub App');
});

test('the menu order puts PR description before Review comments', () => {
  expect(menuIndex('pr_description')).toBeLessThan(menuIndex('review_comments'));
  expect(menuIndex('unknown')).toBe(-1);
});
