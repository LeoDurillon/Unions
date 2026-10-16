// The kinds of event rule action and what each holds; browser-safe, for the settings page and the worker.
import { unknownVariables } from './event-rule-types';

/** Where a GitHub comment goes: the ticket's issue, or its pull request. */
export type CommentTarget = 'issue' | 'pull_request';

/** What each kind of action holds beside its `kind`: one kind per place a rule acts on. */
type ActionFields = {
  /** Sets one property of the ticket's Notion page; `value` is a template (`{pr.url}`). */
  notion_property: { propertyId: string; value: string };
  /** Comments on the ticket's issue or pull request; `body` is a template. */
  github_comment: { on: CommentTarget; body: string };
};

export type ActionKind = keyof ActionFields;

export type ActionOf<K extends ActionKind> = { kind: K } & ActionFields[K];

/** What a rule does when its trigger matches. */
export type EventAction = { [K in ActionKind]: ActionOf<K> }[ActionKind];

export type NotionPropertyAction = ActionOf<'notion_property'>;
export type GitHubCommentAction = ActionOf<'github_comment'>;

export const ACTION_KINDS = [
  'notion_property',
  'github_comment',
] as const satisfies readonly ActionKind[];

export const ACTION_LABELS: Record<ActionKind, string> = {
  notion_property: "Set a property of the ticket's Notion page",
  github_comment: 'Comment on GitHub',
};

export const COMMENT_TARGETS = [
  'issue',
  'pull_request',
] as const satisfies readonly CommentTarget[];

export const COMMENT_TARGET_LABELS: Record<CommentTarget, string> = {
  issue: "The ticket's issue",
  pull_request: "The ticket's pull request",
};

/** GitHub refuses longer comments. */
const MAX_COMMENT = 65_536;

const EMPTY_ACTIONS: { [K in ActionKind]: ActionOf<K> } = {
  notion_property: { kind: 'notion_property', propertyId: '', value: '' },
  github_comment: { kind: 'github_comment', on: 'issue', body: '' },
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
