import { expect, test } from 'bun:test';

import type { AgentConfig } from '@union/core';

import {
  isUnionSection,
  menuIndex,
  UNION_SETTINGS_GROUPS,
} from '../../lib/union-settings/union-settings-groups';
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
  custom: { name: 'Security pass', kind: 'step' },
} as unknown as AgentConfig;

const MERGE = {
  agent: 'agent_3',
  custom: { name: 'Merge readiness', kind: 'review' },
} as unknown as AgentConfig;

test('a custom agent has a page, after the built-in agents, named after it', () => {
  expect(isUnionSection('agent_2')).toBe(true);
  expect(isUnionSection('agent_x')).toBe(false);
  expect(menuIndex('agent_2')).toBeGreaterThan(menuIndex('lesson_writer'));
  expect(menuIndex('agent_2')).toBeGreaterThan(menuIndex('agent_1'));
  expect(unionSectionLabel('agent_2', [SECURITY])).toBe('Security pass');
  expect(unionSectionLabel('agent_3', [SECURITY])).toBe('Custom agent');
});

test('the menu lists All agents instead of a page per agent, then Tools and the GitHub App', () => {
  const groups = navGroups([SECURITY, MERGE]);
  expect(groups.map((group) => group.label)).toEqual(['General', 'Agents', 'Tools', 'GitHub']);
  expect(groups[1]?.sections).toEqual([{ id: 'models', label: 'All agents' }]);
});

test('the agent page open shows under All agents, a custom one by its name', () => {
  expect(navGroups([SECURITY], 'test_plan')[1]?.sections).toEqual([
    { id: 'models', label: 'All agents' },
    { id: 'test_plan', label: 'Test plan' },
  ]);
  expect(navGroups([SECURITY], 'agent_2')[1]?.sections.at(-1)).toEqual({
    id: 'agent_2',
    label: 'Security pass',
  });
  expect(navGroups([SECURITY], 'tools')[1]?.sections).toHaveLength(1);
  expect(navGroups([SECURITY], 'shared')[1]?.sections).toHaveLength(1);
});
