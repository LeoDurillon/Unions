import { expect, test } from 'bun:test';

import { githubText, githubTitle } from './github-text';

test('bot markers and layout tags go, their text and code with angle brackets stay', () => {
  const body = `<!-- marker -->
<details>
<summary>🧹 Nitpick comments (1)</summary><blockquote>

\`236\`: **Exercise a multi-page notice**, keep \`Array<string>\` typed.

</blockquote></details>`;
  expect(githubText(body)).toBe(
    '🧹 Nitpick comments (1)\n\n`236`: **Exercise a multi-page notice**, keep `Array<string>` typed.',
  );
});

test('a title skips alert markers, rules and images, and drops markdown marks', () => {
  expect(githubTitle('> [!NOTE]\n> ## Reviews paused\n> It looks like…')).toBe('Reviews paused');
  expect(githubTitle('![badge](x.svg)\n---\n**Actionable comments posted: 8**')).toBe(
    'Actionable comments posted: 8',
  );
  expect(githubTitle('The preview for [Monorepo](https://x) is `ready`.')).toBe(
    'The preview for Monorepo is ready.',
  );
  expect(githubTitle('')).toBe('');
});

test('a long title is cut', () => {
  const title = githubTitle('word '.repeat(60));
  expect(title.length).toBe(120);
  expect(title.endsWith('…')).toBe(true);
});
