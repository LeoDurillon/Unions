import { expect, test } from 'bun:test';

import {
  MAX_WRITTEN_PROMPT_CHARS,
  parseWrittenPrompt,
  promptWriterPrompt,
  PromptWriterError,
} from './prompt-writer';

test("the writer gets the agent's name and role, the house style, and the output heading", () => {
  const prompt = promptWriterPrompt({ name: 'Security pass', role: 'Check auth and secrets' });
  expect(prompt).toContain('<role>\nCheck auth and secrets\n</role>');
  expect(prompt).toContain('Output one section starting with "## Technical implementation".');
  expect(prompt).toContain('Output one section starting with `## Security pass`.');
  expect(prompt).toContain('never changes a file');
});

test('the answer is the prompt alone: a fence around it is dropped, empty or too long is refused', () => {
  expect(parseWrittenPrompt('  Check auth.\nOutput one section.  ')).toBe(
    'Check auth.\nOutput one section.',
  );
  expect(parseWrittenPrompt('```markdown\nCheck auth.\n```')).toBe('Check auth.');
  expect(() => parseWrittenPrompt('```\n\n```')).toThrow(PromptWriterError);
  expect(() => parseWrittenPrompt('x'.repeat(MAX_WRITTEN_PROMPT_CHARS + 1))).toThrow('longer than');
});
