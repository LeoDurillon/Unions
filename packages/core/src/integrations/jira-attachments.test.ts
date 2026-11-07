import { expect, test } from 'bun:test';

import { issueMarkdown } from './jira-attachments';
import type { JiraIssue } from './jira-parse';

const SITE = 'https://acme.atlassian.net';
const content = (id: string): string => `${SITE}/rest/api/3/attachment/content/${id}`;

function media(alt: string): Record<string, unknown> {
  return {
    type: 'mediaSingle',
    content: [{ type: 'media', attrs: { id: `media-${alt}`, alt, type: 'file', collection: '' } }],
  };
}

function issue(description: unknown, attachments: JiraIssue['attachments']): JiraIssue {
  return { key: 'ABC-1', summary: 'S', projectKey: 'ABC', description, attachments };
}

const SCREEN = { id: '10', filename: 'screen.png', mimeType: 'image/png', content: '' };
const SPEC = { id: '11', filename: 'spec (v2).pdf', mimeType: 'application/pdf', content: '' };
const LOGO = { id: '12', filename: 'logo.svg', mimeType: 'image/svg+xml', content: '' };
const PHOTO = { id: '13', filename: 'photo [1].jpg', mimeType: 'image/jpeg', content: '' };

test('media in the text link their attachment by file name; raster images as images', () => {
  const description = {
    type: 'doc',
    content: [media('screen.png'), media('spec (v2).pdf'), media('logo.svg'), media('gone.txt')],
  };
  expect(issueMarkdown(issue(description, [SCREEN, SPEC, LOGO]), SITE)).toBe(
    [
      `![screen.png](${content('10')})`,
      `[spec (v2).pdf](${content('11')})`,
      `[logo.svg](${content('12')})`,
      '*gone.txt*',
    ].join('\n\n'),
  );
});

test('attachments the text does not show are listed at the end', () => {
  const description = { type: 'doc', content: [media('screen.png')] };
  expect(issueMarkdown(issue(description, [SCREEN, SPEC, PHOTO]), SITE)).toBe(
    [
      `![screen.png](${content('10')})`,
      '## Attachments',
      [
        `- [spec (v2).pdf](${content('11')})`,
        String.raw`- ![photo \[1\].jpg](${content('13')})`,
      ].join('\n'),
    ].join('\n\n'),
  );
});

test('an issue without a description still lists its attachments; one without either is empty', () => {
  expect(issueMarkdown(issue(null, [SPEC]), SITE)).toBe(
    `## Attachments\n\n- [spec (v2).pdf](${content('11')})`,
  );
  expect(issueMarkdown(issue(null, []), SITE)).toBe('');
});

test('two attachments with one name: the text shows the first, the other is listed', () => {
  const again = { ...SCREEN, id: '20' };
  const description = { type: 'doc', content: [media('screen.png')] };
  expect(issueMarkdown(issue(description, [SCREEN, again]), SITE)).toBe(
    `![screen.png](${content('10')})\n\n## Attachments\n\n- ![screen.png](${content('20')})`,
  );
});

test('a media node without a name is matched by its media id when one is known', () => {
  const card = {
    type: 'mediaSingle',
    content: [{ type: 'media', attrs: { id: 'AB-CD', type: 'file', collection: '' } }],
  };
  const description = { type: 'doc', content: [card] };
  expect(issueMarkdown(issue(description, [SPEC]), SITE, new Map([['ab-cd', '11']]))).toBe(
    `[spec (v2).pdf](${content('11')})`,
  );
  expect(issueMarkdown(issue(description, [SPEC]), SITE)).toBe(
    `*attachment*\n\n## Attachments\n\n- [spec (v2).pdf](${content('11')})`,
  );
});
