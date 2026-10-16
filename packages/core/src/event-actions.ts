// The kinds of event rule action and what each holds; browser-safe, for the settings page and the worker.
import { checkPullRequestChanges, type PullRequestChange } from './event-pull-request-action';
import { unknownVariables } from './event-rule-types';

/** Where a GitHub comment goes: the ticket's issue, or its pull request. */
export type CommentTarget = 'issue' | 'pull_request';

/** One property of the ticket's Notion page and what it is set to; `value` is a template (`{pr.url}`). */
export type NotionValue = { propertyId: string; value: string };

/** What each kind of action holds beside its `kind`: one kind per place a rule acts on. */
type ActionFields = {
  /** Sets properties of the ticket's Notion page, all in one request. */
  notion_property: { values: NotionValue[] };
  /** Comments on the ticket's issue or pull request; `body` is a template. */
  github_comment: { on: CommentTarget; body: string };
  /** Changes the ticket's pull request: labels, reviewers, assignees, title, a description section. */
  github_pull_request: { changes: PullRequestChange[] };
  /** Notifies the user in Union (the bell, desktop notifications); `message` is a template. */
  union_notification: { message: string };
};

export type ActionKind = keyof ActionFields;

export type ActionOf<K extends ActionKind> = { kind: K } & ActionFields[K];

/** What a rule does when its trigger matches. */
export type EventAction = { [K in ActionKind]: ActionOf<K> }[ActionKind];

export type NotionPropertyAction = ActionOf<'notion_property'>;
export type GitHubCommentAction = ActionOf<'github_comment'>;
export type UnionNotificationAction = ActionOf<'union_notification'>;
export type GitHubPullRequestAction = ActionOf<'github_pull_request'>;

export const ACTION_KINDS = [
  'notion_property',
  'github_comment',
  'github_pull_request',
  'union_notification',
] as const satisfies readonly ActionKind[];

export const ACTION_LABELS: Record<ActionKind, string> = {
  notion_property: "Set properties of the ticket's Notion page",
  github_comment: 'Comment on GitHub',
  github_pull_request: "Update the ticket's pull request",
  union_notification: 'Notify me in Union',
};

export const COMMENT_TARGETS = [
  'issue',
  'pull_request',
] as const satisfies readonly CommentTarget[];

export const COMMENT_TARGET_LABELS: Record<CommentTarget, string> = {
  issue: "The ticket's issue",
  pull_request: "The ticket's pull request",
};

/** A notification's text is cut there once its variables are filled in. */
export const MAX_NOTIFICATION = 300;

/** GitHub refuses longer comments. */
const MAX_COMMENT = 65_536;

const EMPTY_ACTIONS: { [K in ActionKind]: ActionOf<K> } = {
  notion_property: { kind: 'notion_property', values: [{ propertyId: '', value: '' }] },
  github_comment: { kind: 'github_comment', on: 'issue', body: '' },
  github_pull_request: { kind: 'github_pull_request', changes: [] },
  union_notification: { kind: 'union_notification', message: '' },
};

/** A new action of `kind`, before the user fills it in. */
export function emptyAction(kind: ActionKind): EventAction {
  return EMPTY_ACTIONS[kind];
}

export function isActionKind(value: unknown): value is ActionKind {
  return ACTION_KINDS.some((kind) => kind === value);
}

function isCommentTarget(value: unknown): value is CommentTarget {
  return COMMENT_TARGETS.some((target) => target === value);
}

/** A GitHub comment action as sent by the settings page, or why it cannot be saved. */
export function checkGitHubComment(
  record: object,
): { action: GitHubCommentAction } | { error: string } {
  const on = 'on' in record ? record.on : null;
  const body = 'body' in record ? String(record.body).trim() : '';
  if (!isCommentTarget(on)) {
    return { error: 'Pick where to comment: the issue or the pull request' };
  }
  if (body === '') {
    return { error: 'Write the comment' };
  }
  if (body.length > MAX_COMMENT) {
    return { error: `A GitHub comment holds at most ${MAX_COMMENT} characters` };
  }
  const unknown = unknownVariables(body);
  if (unknown.length > 0) {
    return { error: `Unknown variable: {${unknown.join('}, {')}}` };
  }
  return { action: { kind: 'github_comment', on, body } };
}

/** A "Notify me in Union" action as sent by the settings page, or why it cannot be saved. */
export function checkUnionNotification(
  record: object,
): { action: UnionNotificationAction } | { error: string } {
  const message = 'message' in record ? String(record.message).trim() : '';
  if (message === '') {
    return { error: 'Write the notification' };
  }
  if (message.length > MAX_NOTIFICATION) {
    return { error: `A notification holds at most ${MAX_NOTIFICATION} characters` };
  }
  const unknown = unknownVariables(message);
  if (unknown.length > 0) {
    return { error: `Unknown variable: {${unknown.join('}, {')}}` };
  }
  return { action: { kind: 'union_notification', message } };
}

/** An "Update the ticket's pull request" action as sent by the settings page, or why it cannot be saved. */
export function checkGitHubPullRequest(
  record: object,
): { action: GitHubPullRequestAction } | { error: string } {
  const checked = checkPullRequestChanges(record);
  return 'error' in checked
    ? checked
    : { action: { kind: 'github_pull_request', changes: checked.changes } };
}
