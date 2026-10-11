import { expect, test } from 'bun:test';

import { answersOf, fillAnswers, splitAnswers } from './answers';

const INTAKE = `## Technical questions

1. **CLI shape:** Which invocation?
   Answer:

2. **Persistence:** JSON file or memory?
   Answer: memory for now

3. **Edge cases:**
   a. already done?
   b. unknown id?
   **Answer:**

\`\`\`md
Answer: this is an example inside a code block
\`\`\``;

test('each Answer line becomes a slot between the question texts', () => {
  const segments = splitAnswers(INTAKE);
  expect(segments.map((segment) => segment.kind)).toEqual([
    'text',
    'answer',
    'text',
    'answer',
    'text',
    'answer',
    'text',
  ]);
  expect(answersOf(segments)).toEqual(['', 'memory for now', '']);
  expect(segments[2]).toMatchObject({
    kind: 'text',
    text: '\n2. **Persistence:** JSON file or memory?',
  });
});

test('answers are written back in place, keeping indentation and markup', () => {
  const filled = fillAnswers(INTAKE, [
    '`todo done <id>`',
    'a JSON file\nin ~/.todo',
    'error, exit 1',
  ]);
  expect(filled).toContain('   Answer: `todo done <id>`\n');
  expect(filled).toContain('   Answer: a JSON file in ~/.todo\n');
  expect(filled).toContain('   **Answer:** error, exit 1\n');
  expect(filled).toContain('Answer: this is an example inside a code block');
  expect(answersOf(splitAnswers(filled))).toEqual([
    '`todo done <id>`',
    'a JSON file in ~/.todo',
    'error, exit 1',
  ]);
});

test('clearing an answer leaves a bare Answer line, and text without slots is one segment', () => {
  expect(fillAnswers('Q?\nAnswer: old', [''])).toBe('Q?\nAnswer:');
  expect(splitAnswers('## Summary\n\nNo questions.')).toEqual([
    { kind: 'text', key: 'text-0', text: '## Summary\n\nNo questions.' },
  ]);
});
