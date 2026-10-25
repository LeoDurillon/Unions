import { expect, test } from 'bun:test';

import { AGENT_IDS, DEFAULT_PROMPTS } from './agents';
import { missingFormats } from './prompt-formats';

test('no default prompt misses a format', () => {
  expect(
    AGENT_IDS.filter((agent) => missingFormats(agent, DEFAULT_PROMPTS[agent]).length > 0),
  ).toEqual([]);
});

test('a prompt that dropped its format is flagged, once', () => {
  for (const agent of ['intake', 'final_review', 'split_plan', 'split']) {
    expect(missingFormats(agent, 'Do the job well.')).toHaveLength(1);
  }
});

test('the final review needs both verdicts', () => {
  expect(missingFormats('final_review', 'Start with "VERDICT: APPROVED".')).toHaveLength(1);
  expect(
    missingFormats('final_review', 'First line: VERDICT: APPROVED or CHANGES_REQUESTED.'),
  ).toEqual([]);
  expect(
    missingFormats(
      'final_review',
      'Start with "Verdict: Approved" or "Verdict: Changes_requested".',
    ),
  ).toEqual([]);
});

test('agents without a format Union reads never warn', () => {
  expect(missingFormats('summary', '')).toEqual([]);
  expect(missingFormats('agent_3', '')).toEqual([]);
});
