import { expect, test } from 'bun:test';

import { githubText } from './github-text';

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
