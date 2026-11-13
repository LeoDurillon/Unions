// The kinds of event rule action and what each holds; browser-safe, for the settings page and the worker.

import { integrationKinds, type IntegrationKindName } from '../integrations/kinds';
import { TRACKER_ACTION_KINDS, type TrackerActionKind } from '../integrations/tracker-action-kinds';
import {
  checkProjectFields,
  type ProjectFieldValue,
  type ProjectItemTarget,
} from './event-project-fields-action';
import { checkPullRequestChanges, type PullRequestChange } from './event-pull-request-action';
import { unknownVariables } from './event-rule-types';
import {
  emptyTrackerAction,
  trackerActionLabel,
  type TrackerActionFields,
} from './event-tracker-actions';

/** Where a GitHub comment goes: the ticket's issue, or its pull request. */
export type CommentTarget = 'issue' | 'pull_request';

/** What each kind of action holds beside its `kind`: one kind per place a rule acts on. */
type ActionFields = TrackerActionFields & {
  /** Comments on the ticket's issue or pull request; `body` is a template. */
  github_comment: { on: CommentTarget; body: string };
  /** Changes the ticket's pull request: labels, reviewers, assignees, title, a description section. */
  github_pull_request: { changes: PullRequestChange[] };
  /** Sets fields of the ticket's GitHub Project item: its issue's, or its pull request's. */
  github_project_fields: { item: ProjectItemTarget; values: ProjectFieldValue[] };
  /** Notifies the user in Union (the bell, desktop notifications); `message` is a template. */
  union_notification: { message: string };
};

export type ActionKind = keyof ActionFields;

export type ActionOf<K extends ActionKind> = { kind: K } & ActionFields[K];

/** What a rule does when its trigger matches. */
export type EventAction = { [K in ActionKind]: ActionOf<K> }[ActionKind];

export type GitHubCommentAction = ActionOf<'github_comment'>;
export type UnionNotificationAction = ActionOf<'union_notification'>;
export type GitHubPullRequestAction = ActionOf<'github_pull_request'>;
export type GitHubProjectFieldsAction = ActionOf<'github_project_fields'>;

/** The kinds that act on GitHub or Union itself; a tracker's are its kind's `ruleActions`. */
const OWN_KINDS = [
  'github_comment',
  'github_pull_request',
  'github_project_fields',
  'union_notification',
] as const satisfies readonly ActionKind[];

type OwnKind = (typeof OWN_KINDS)[number];

const ACTION_KINDS = [
  ...TRACKER_ACTION_KINDS,
  ...OWN_KINDS,
] as const satisfies readonly ActionKind[];

const OWN_LABELS: Record<OwnKind, string> = {
  github_comment: 'Comment on GitHub',
  github_pull_request: "Update the ticket's pull request",
  github_project_fields: "Set fields of the ticket's GitHub Project item",
  union_notification: 'Notify me in Union',
};

/** What the rule editor offers: a kind, and the tracker a tracker action acts on (null for the others). */
export type ActionChoice =
  | { kind: TrackerActionKind; tracker: IntegrationKindName }
  | { kind: OwnKind; tracker: null };

export function isTrackerActionKind(kind: ActionKind): kind is TrackerActionKind {
  return TRACKER_ACTION_KINDS.some((each) => each === kind);
}

/** Every choice: GitHub's and Union's kinds, then each tracker's actions. */
export function actionChoices(): ActionChoice[] {
  const own = OWN_KINDS.map((kind): ActionChoice => ({ kind, tracker: null }));
  const trackers = integrationKinds().flatMap(({ kind: tracker, ruleActions }) =>
    ruleActions.map((kind): ActionChoice => ({ kind, tracker })),
  );
  return [...own, ...trackers];
}

/** The choice the action is. */
export function choiceOf(action: EventAction): ActionChoice {
  return 'tracker' in action
    ? { kind: action.kind, tracker: action.tracker }
    : { kind: action.kind, tracker: null };
}

/** The choice as an `<option>`'s value: `tracker_fields:jira`, `github_comment`. */
export function choiceKey(choice: ActionChoice): string {
  return choice.tracker === null ? choice.kind : `${choice.kind}:${choice.tracker}`;
}

export function choiceLabel(choice: ActionChoice): string {
  return choice.tracker === null
    ? OWN_LABELS[choice.kind]
    : trackerActionLabel(choice.kind, choice.tracker);
}

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

const EMPTY_ACTIONS: { [K in OwnKind]: ActionOf<K> } = {
  github_comment: { kind: 'github_comment', on: 'issue', body: '' },
  github_pull_request: { kind: 'github_pull_request', changes: [] },
  github_project_fields: {
    kind: 'github_project_fields',
    item: 'pull_request',
    values: [{ fieldId: '', fieldName: '', fieldType: 'text', value: '' }],
  },
  union_notification: { kind: 'union_notification', message: '' },
};

/** A new action of the choice, before the user fills it in. */
export function emptyAction(choice: ActionChoice): EventAction {
  return choice.tracker === null
    ? EMPTY_ACTIONS[choice.kind]
    : emptyTrackerAction(choice.kind, choice.tracker);
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

/** A "Set fields of the ticket's GitHub Project item" action as sent by the settings page, or why it cannot be saved. */
export function checkGitHubProjectFields(
  record: object,
): { action: GitHubProjectFieldsAction } | { error: string } {
  const checked = checkProjectFields(record);
  return 'error' in checked ? checked : { action: { kind: 'github_project_fields', ...checked } };
}
