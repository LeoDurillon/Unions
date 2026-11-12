// Tests the "Suggest improvements" prompt: the usage per step, each finding with its figures and tickets, and the answer asked.
import { expect, test } from 'bun:test';

import type { ProjectFindings } from './project-findings';
import { suggestionPrompt } from './usage-suggestion-prompt';
import type { StepRules } from './usage-suggestion-rules';
import type { ProjectUsage } from './usage-summary';

const SLICE = { calls: 3, input: 0, output: 0, costUsd: 12.5 };

const USAGE: ProjectUsage = {
  total: SLICE,
  weeks: [],
  steps: [{ ...SLICE, step: 'implement' }],
  models: [],
  tickets: [],
  investigations: { ...SLICE, costUsd: 0, calls: 0 },
};

const RULES: StepRules[] = [
  { step: 'implement', tools: ['Read', 'Bash'], denied: ['Bash(git checkout*)'] },
  { step: 'intake', tools: ['Read'], denied: [] },
];

const FINDINGS: ProjectFindings = {
  findings: [
    {
      kind: 'large_sessions',
      actor: 'union',
      items: [{ label: 'implement', value: 312_592, calls: 251, tickets: [18] }],
    },
    {
      kind: 'costly_tickets',
      actor: 'union',
      items: [{ label: '', value: 279_819_251, calls: 41, tickets: [18] }],
    },
  ],
  tickets: { 18: { title: 'Les AIR', issueNumber: 1641 } },
};

test('the prompt gives the figures, the tickets by name, and what to answer', () => {
  const { title, prompt } = suggestionPrompt(FINDINGS, USAGE, RULES, 'all time');
  expect(title).toBe('Suggest improvements from usage over all time');
  expect(prompt).toContain(
    'In all: $12.50, 3 agent calls. Per step:\n- implement: $12.50, 3 calls',
  );
  expect(prompt).toContain(
    '- `implement`: 313k tokens on average over 251 calls; seen most in #1641',
  );
  expect(prompt).toContain('- #1641: $279.82 API-equivalent, 41 implementation calls');
  expect(prompt).toContain('## Tickets named above\n- #1641: Les AIR\n');
  expect(prompt).toContain('(for Union)');
  expect(prompt).toContain('Do not change any file.');
});

test('the prompt says which rules Union runs each step under', () => {
  const { prompt } = suggestionPrompt(FINDINGS, USAGE, RULES, 'all time');
  expect(prompt).toContain('## How Union runs the agents');
  expect(prompt).toContain(
    'Every run is denied `Bash(git push*)`, `Bash(git remote*)`, `Bash(gh *)`, `Bash(curl *)`.',
  );
  expect(prompt).toContain(
    '- implement: tools `Read`, `Bash`; also denied `Bash(git checkout*)`\n- intake: tools `Read`\n',
  );
  expect(prompt.indexOf('## How Union runs')).toBeLessThan(prompt.indexOf('## What stands out'));
});
