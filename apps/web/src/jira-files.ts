// Downloads a Jira issue's attachments its text links (`/rest/api/3/attachment/content/<id>` of the site) as the
// ticket's files, with the integration's token; the token is never sent off the site.
import type { JiraConfig } from '@union/core';

import { fetchTrackerFiles, type FileSource, type TrackerFile } from './tracker-files';

const CONTENT_PATH = /^\/rest\/api\/3\/attachment\/content\/\d+$/u;
/** 301 to 308: a redirect with a `Location` (304 has none, so it is never followed). */
const FIRST_REDIRECT = 301;
const LAST_REDIRECT = 308;
const BAD_GATEWAY = 502;

/** A link to an attachment of the configured site, and nothing else. */
function isAttachment(url: string, site: string): boolean {
  const parsed = new URL(url);
  return parsed.origin === site && CONTENT_PATH.test(parsed.pathname) && parsed.search === '';
}

/**
 * Jira answers with a redirect to its media host: followed by hand, without the token, so it only
 * ever goes to the site. A redirect elsewhere than https is not followed.
 */
async function getAttachment(
  url: string,
  authorization: string,
  signal: AbortSignal,
  fetchFn: typeof fetch,
): Promise<Response> {
  const response = await fetchFn(url, { headers: { authorization }, redirect: 'manual', signal });
  const location = response.headers.get('location');
  const redirected = response.status >= FIRST_REDIRECT && response.status <= LAST_REDIRECT;
  if (!redirected || location === null || !URL.canParse(location, url)) {
    return response;
  }
  await response.body?.cancel();
  const target = new URL(location, url);
  if (target.protocol !== 'https:') {
    return new Response(null, { status: BAD_GATEWAY });
  }
  return fetchFn(target, { redirect: 'follow', signal });
}

/** Downloads the issue's attachments the markdown links; a file not kept keeps its link to Jira. */
export function fetchJiraFiles(
  markdown: string,
  access: { secret: string; config: JiraConfig },
  fetchFn: typeof fetch = fetch,
): Promise<{ markdown: string; files: TrackerFile[] }> {
  const { site, email } = access.config;
  const authorization = `Basic ${Buffer.from(`${email}:${access.secret}`).toString('base64')}`;
  const source: FileSource = {
    isFile: (url) => isAttachment(url, site),
    get: (url, signal, fetchImpl) => getAttachment(url, authorization, signal, fetchImpl),
    // Jira keeps the uploaded file names: the link's text is one.
    imagePrefix: null,
    nameFromText: true,
    fallbackName: 'jira-attachment',
  };
  return fetchTrackerFiles(markdown, source, fetchFn);
}
