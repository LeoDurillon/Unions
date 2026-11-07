// The link that names a comment of a Jira issue, kept on a review comment added from it; browser-safe.

/** `https://<site>/browse/<key>?focusedCommentId=<id>`: where Jira opens the issue at the comment. */
export function jiraCommentUrl(site: string, key: string, commentId: string): string {
  return `${site}/browse/${encodeURIComponent(key)}?focusedCommentId=${encodeURIComponent(commentId)}`;
}

const JIRA_COMMENT =
  /^https:\/\/[a-z0-9][a-z0-9-]*\.atlassian\.net\/browse\/[^?/]+\?focusedCommentId=[^&]+$/u;

/** A review comment's source is a Jira comment, not a GitHub comment. */
export function isJiraCommentUrl(url: string): boolean {
  return JIRA_COMMENT.test(url);
}

/** The same links as a SQL `LIKE` pattern, for the queries that tell them from GitHub's. */
export const JIRA_COMMENT_URL_LIKE = 'https://%.atlassian.net/browse/%?focusedCommentId=%';
