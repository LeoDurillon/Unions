import { expect, test } from 'bun:test';

import type { AgentConfig } from '@union/core';

import { isUnionSection, menuIndex, UNION_SETTINGS_GROUPS } from '../../lib/union-settings-groups';
import { AGENT_LABELS } from '../agents/agent-labels';
import { navGroups } from './union-nav-groups';
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

const SECURITY = {
  agent: 'agent_2',
  custom: { name: 'Security pass' },
} as unknown as AgentConfig;

test('a custom agent has a page, after the built-in agents, named after it', () => {
  expect(isUnionSection('agent_2')).toBe(true);
  expect(isUnionSection('agent_x')).toBe(false);
  expect(menuIndex('agent_2')).toBeGreaterThan(menuIndex('lesson_writer'));
  expect(menuIndex('agent_2')).toBeGreaterThan(menuIndex('agent_1'));
  expect(unionSectionLabel('agent_2', [SECURITY])).toBe('Security pass');
  expect(unionSectionLabel('agent_3', [SECURITY])).toBe('Custom agent');
});

test('the menu shows a Custom agents group before Tools only when there are some', () => {
  expect(navGroups([]).map((group) => group.label)).not.toContain('Custom agents');
  const labels = navGroups([SECURITY]).map((group) => group.label);
  expect(labels.indexOf('Custom agents')).toBe(labels.indexOf('Tools') - 1);
  expect(navGroups([SECURITY]).find((group) => group.label === 'Custom agents')?.sections).toEqual([
    { id: 'agent_2', label: 'Security pass' },
  ]);
});
