// A Jira integration's config (site, account email, project key) and issue keys, parsed from what users paste; browser-safe.

/** The config of a Jira Cloud integration; the API token is its secret, not config. */
export type JiraConfig = { site: string; email: string; projectKey: string };

/** Jira Cloud's hosts: the token is only ever sent to one of them. */
const SITE_HOST = /^[a-z0-9][a-z0-9-]*\.atlassian\.net$/u;
const BARE_SITE = /^[a-z0-9][a-z0-9-]*$/u;
const PROJECT_KEY = /^[A-Z][A-Z0-9_]{0,49}$/u;
const ISSUE_KEY = /^[A-Z][A-Z0-9_]*-[1-9]\d*$/u;
const BROWSE_PATH = /\/browse\/(?<key>[^/?#]+)/u;
const EMAIL = /^[^\s@]+@[^\s@]+$/u;

/** A site as `https://<name>.atlassian.net`, from that URL, its host, a page of it or the bare name; null otherwise. */
export function jiraSiteOf(input: string): string | null {
  const value = input.trim().toLowerCase();
  if (BARE_SITE.test(value)) {
    return `https://${value}.atlassian.net`;
  }
  const withScheme = value.includes('://') ? value : `https://${value}`;
  if (!URL.canParse(withScheme)) {
    return null;
  }
  const url = new URL(withScheme);
  return url.protocol === 'https:' && url.port === '' && SITE_HOST.test(url.hostname)
    ? url.origin
    : null;
}

function issueKey(value: string | null | undefined): string | null {
  const key = value?.trim().toUpperCase() ?? '';
  return ISSUE_KEY.test(key) ? key : null;
}

/** An issue key (`ABC-123`) from the bare key or a link: `/browse/ABC-123`, or a board's `selectedIssue=`. */
export function parseJiraKey(input: string): string | null {
  const bare = issueKey(input);
  if (bare !== null || !URL.canParse(input.trim())) {
    return bare;
  }
  const url = new URL(input.trim());
  return (
    issueKey(url.searchParams.get('selectedIssue')) ??
    issueKey(BROWSE_PATH.exec(url.pathname)?.groups?.key)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function field(input: unknown, name: string): string {
  const value = isRecord(input) ? input[name] : undefined;
  return typeof value === 'string' ? value.trim() : '';
}

/** Why a pasted link is not of the integration's site; null for a bare key, a link of the site, or no config. */
export function jiraRefSiteError(input: string, config: unknown): string | null {
  const value = input.trim();
  const read = readJiraConfig(config);
  if (!URL.canParse(value) || 'error' in read) {
    return null;
  }
  const site = jiraSiteOf(value);
  return site === read.config.site
    ? null
    : `That link is not on the project's Jira site (${read.config.site})`;
}

/** A config as the browser sends it, checked and normalized; or what is wrong with it. */
export function readJiraConfig(input: unknown): { config: JiraConfig } | { error: string } {
  const site = jiraSiteOf(field(input, 'site'));
  if (site === null) {
    return { error: 'The Jira site is its https://<name>.atlassian.net address' };
  }
  const email = field(input, 'email');
  if (!EMAIL.test(email)) {
    return { error: 'Give the email of the Jira account the API token belongs to' };
  }
  const projectKey = field(input, 'projectKey').toUpperCase();
  if (!PROJECT_KEY.test(projectKey)) {
    return { error: 'That is not a Jira project key (the ABC of ABC-123)' };
  }
  return { config: { site, email, projectKey } };
}

/** The config of a stored integration; throws when it is not a Jira one. */
export function jiraConfigOf(config: unknown): JiraConfig {
  const read = readJiraConfig(config);
  if ('error' in read) {
    throw new Error(`This Jira integration's config is incomplete: ${read.error}`);
  }
  return read.config;
}
