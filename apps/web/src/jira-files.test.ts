import { expect, test } from 'bun:test';

import { fetchJiraFiles } from './jira-files';

const SITE = 'https://acme.atlassian.net';
const ACCESS = {
  secret: 'tok',
  config: { site: SITE, email: 'ada@acme.com', projectKey: 'ABC' },
};
const AUTH = `Basic ${Buffer.from('ada@acme.com:tok').toString('base64')}`;
const PNG = new Uint8Array([137, 80, 78, 71]);
const PDF = new Uint8Array([37, 80, 68, 70]);
const content = (id: string): string => `${SITE}/rest/api/3/attachment/content/${id}`;
const MEDIA = 'https://api.media.atlassian.com/file/abc/binary?token=short-lived';

type Seen = { url: string; authorization: string | null; redirect: string | undefined };

/** Answers by URL, and records each request with the authorization it carried. */
function fakeFetch(answers: Record<string, () => Response>, seen: Seen[]): typeof fetch {
  return ((input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : input.toString();
    seen.push({
      url,
      authorization: new Headers(init?.headers).get('authorization'),
      redirect: init?.redirect,
    });
    return Promise.resolve(answers[url]?.() ?? new Response('gone', { status: 404 }));
  }) as typeof fetch;
}

test('attachments are fetched with the token, their redirect without it, and kept by name', async () => {
  const seen: Seen[] = [];
  const markdown = [
    `![screen.png](${content('10')})`,
    '## Attachments',
    `- [spec (v2).pdf](${content('11')})`,
  ].join('\n\n');
  const result = await fetchJiraFiles(
    markdown,
    ACCESS,
    fakeFetch(
      {
        [content('10')]: () => new Response(PNG, { headers: { 'content-type': 'image/png' } }),
        [content('11')]: () => new Response(null, { status: 303, headers: { location: MEDIA } }),
        [MEDIA]: () =>
          new Response(PDF, {
            headers: {
              'content-type': 'application/pdf',
              'content-disposition': 'attachment; filename="spec (v2).pdf"',
            },
          }),
      },
      seen,
    ),
  );
  expect(result.files).toEqual([
    { name: 'screen.png', bytes: PNG, contentType: 'image/png', image: true },
    { name: 'spec__v2_.pdf', bytes: PDF, contentType: 'application/pdf', image: false },
  ]);
  expect(result.markdown).toBe(
    [
      '![screen.png](attachment:screen.png)',
      '## Attachments',
      '- [spec (v2).pdf](attachment:spec__v2_.pdf)',
    ].join('\n\n'),
  );
  expect(seen).toEqual([
    { url: content('10'), authorization: AUTH, redirect: 'manual' },
    { url: content('11'), authorization: AUTH, redirect: 'manual' },
    { url: MEDIA, authorization: null, redirect: 'follow' },
  ]);
});

test('links off the site or outside its attachments are never fetched with the token', async () => {
  const seen: Seen[] = [];
  const markdown = [
    '![x](https://other.atlassian.net/rest/api/3/attachment/content/10)',
    `![x](${SITE}/rest/api/3/issue/ABC-1)`,
    `![x](${content('10')}?redirect=false)`,
    '![x](https://example.com/screen.png)',
  ].join('\n');
  const result = await fetchJiraFiles(markdown, ACCESS, fakeFetch({}, seen));
  expect(seen).toEqual([]);
  expect(result).toEqual({ markdown, files: [] });
});

test('a redirect to plain http is not followed; a failed download keeps its link', async () => {
  const seen: Seen[] = [];
  const markdown = `[a.pdf](${content('11')})\n[b.pdf](${content('12')})`;
  const result = await fetchJiraFiles(
    markdown,
    ACCESS,
    fakeFetch(
      {
        [content('11')]: () =>
          new Response(null, { status: 302, headers: { location: 'http://media.example/a.pdf' } }),
      },
      seen,
    ),
  );
  expect(result).toEqual({ markdown, files: [] });
  expect(seen.map((request) => request.url)).toEqual([content('11'), content('12')]);
});
