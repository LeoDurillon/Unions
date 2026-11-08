// A rule's changes to the ticket's pull request (labels, reviewers, assignees, title, a description section); browser-safe.
import { unknownVariables } from './event-rule-types';

export type PullRequestChange =
  | { kind: 'labels'; add: string[]; remove: string[] }
  | { kind: 'reviewers'; users: string[] }
  | { kind: 'assignees'; users: string[] }
  /** A template. */
  | { kind: 'title'; value: string }
  /** A template, written as the rule's own section of the description. */
  | { kind: 'description'; value: string };

export type PullRequestChangeKind = PullRequestChange['kind'];

export type ChangeOf<K extends PullRequestChangeKind> = Extract<PullRequestChange, { kind: K }>;

export const PULL_REQUEST_CHANGE_KINDS = [
  'labels',
  'reviewers',
  'assignees',
  'title',
  'description',
] as const satisfies readonly PullRequestChangeKind[];

export const PULL_REQUEST_CHANGE_LABELS: Record<PullRequestChangeKind, string> = {
  labels: 'Labels',
  reviewers: 'Request reviews',
  assignees: 'Assignees',
  title: 'Title',
  description: 'A section of the description',
};

const EMPTY_CHANGES: { [K in PullRequestChangeKind]: ChangeOf<K> } = {
  labels: { kind: 'labels', add: [], remove: [] },
  reviewers: { kind: 'reviewers', users: [] },
  assignees: { kind: 'assignees', users: [] },
  title: { kind: 'title', value: '' },
  description: { kind: 'description', value: '' },
};

/** A new change of `kind`, before the user fills it in. */
export function emptyChange(kind: PullRequestChangeKind): PullRequestChange {
  return EMPTY_CHANGES[kind];
}

export function isPullRequestChangeKind(value: unknown): value is PullRequestChangeKind {
  return PULL_REQUEST_CHANGE_KINDS.some((kind) => kind === value);
}

/** GitHub's limits on a label name, a pull request title, and its description (with room for the rest). */
const MAX_LABEL = 50;
const MAX_TITLE = 256;
const MAX_DESCRIPTION = 60_000;
const LOGIN = /^[\da-z](?:[\da-z]|-(?=[\da-z])){0,38}$/iu;

type Checked = { change: PullRequestChange } | { error: string };

/** The trimmed, distinct, non-empty strings of a list. */
function namesOf(list: unknown): string[] {
  const names = Array.isArray(list) ? list.map((item) => String(item).trim()) : [];
  return [...new Set(names.filter((name) => name !== ''))];
}

function checkLabels(record: object): Checked {
  const add = namesOf('add' in record ? record.add : []);
  const remove = namesOf('remove' in record ? record.remove : []);
  const long = [...add, ...remove].find((name) => name.length > MAX_LABEL);
  if (long !== undefined) {
    return { error: `A label name holds at most ${MAX_LABEL} characters: "${long}"` };
  }
  const both = add.find((name) => remove.includes(name));
  if (both !== undefined) {
    return { error: `The label "${both}" is both added and removed` };
  }
  return add.length + remove.length === 0
    ? { error: 'Pick labels to add or remove' }
    : { change: { kind: 'labels', add, remove } };
}

function checkUsers(kind: 'reviewers' | 'assignees', record: object): Checked {
  const users = namesOf('users' in record ? record.users : []).map((user) =>
    user.replace(/^@/u, ''),
  );
  const wrong = users.find((user) => !LOGIN.test(user));
  if (wrong !== undefined) {
    return { error: `"${wrong}" is not a GitHub login` };
  }
  if (users.length === 0) {
    return { error: kind === 'reviewers' ? 'Pick who reviews' : 'Pick who is assigned' };
  }
  return { change: { kind, users } };
}

function checkTemplate(kind: 'title' | 'description', record: object): Checked {
  const value = 'value' in record ? String(record.value).trim() : '';
  const max = kind === 'title' ? MAX_TITLE : MAX_DESCRIPTION;
  if (value === '') {
    return { error: kind === 'title' ? 'Write the title' : 'Write the description section' };
  }
  if (value.length > max) {
    return { error: `The ${kind} holds at most ${max} characters` };
  }
  const unknown = unknownVariables(value);
  return unknown.length > 0
    ? { error: `Unknown variable: {${unknown.join('}, {')}}` }
    : { change: { kind, value } };
}

const CHANGE_CHECKS: Record<PullRequestChangeKind, (record: object) => Checked> = {
  labels: checkLabels,
  reviewers: (record) => checkUsers('reviewers', record),
  assignees: (record) => checkUsers('assignees', record),
  title: (record) => checkTemplate('title', record),
  description: (record) => checkTemplate('description', record),
};

function checkChange(entry: unknown): Checked {
  const record = typeof entry === 'object' && entry !== null ? entry : {};
  const kind = 'kind' in record ? record.kind : null;
  return isPullRequestChangeKind(kind)
    ? CHANGE_CHECKS[kind](record)
    : { error: 'Pick what to change on the pull request' };
}

/** The changes as sent by the settings page, or why they cannot be saved: one of each kind at most. */
export function checkPullRequestChanges(
  record: object,
): { changes: PullRequestChange[] } | { error: string } {
  const list: unknown[] =
    'changes' in record && Array.isArray(record.changes) ? record.changes : [];
  if (list.length === 0) {
    return { error: 'Pick what to change on the pull request' };
  }
  const changes: PullRequestChange[] = [];
  for (const entry of list) {
    const checked = checkChange(entry);
    if ('error' in checked) {
      return checked;
    }
    if (changes.some((change) => change.kind === checked.change.kind)) {
      return { error: `${PULL_REQUEST_CHANGE_LABELS[checked.change.kind]}: once per rule` };
    }
    changes.push(checked.change);
  }
  return { changes };
}

function sectionMarks(ruleId: number): { start: string; end: string } {
  return { start: `<!-- union-rule:${ruleId} -->`, end: `<!-- /union-rule:${ruleId} -->` };
}

/**
 * The description with the rule's section in it: replaced where it is, else added at the end. The
 * rest is kept, and writing it again changes nothing.
 */
export function withRuleSection(body: string, ruleId: number, text: string): string {
  const { start, end } = sectionMarks(ruleId);
  const section = `${start}\n${text}\n${end}`;
  const from = body.indexOf(start);
  const to = from === -1 ? -1 : body.indexOf(end, from);
  if (to !== -1) {
    return `${body.slice(0, from)}${section}${body.slice(to + end.length)}`;
  }
  return body.trim() === '' ? section : `${body.trimEnd()}\n\n${section}`;
}

function logins(users: string[]): string {
  return users.map((user) => `@${user}`).join(', ');
}

type Describers = { [K in PullRequestChangeKind]: (change: ChangeOf<K>, text: string) => string };

const DESCRIBERS: Describers = {
  labels: (change) =>
    [
      change.add.length > 0 ? `added labels ${change.add.join(', ')}` : '',
      change.remove.length > 0 ? `removed labels ${change.remove.join(', ')}` : '',
    ]
      .filter((part) => part !== '')
      .join(', '),
  reviewers: (change) => `requested reviews from ${logins(change.users)}`,
  assignees: (change) => `assigned ${logins(change.users)}`,
  title: (_change, text) => `title set to "${text}"`,
  description: (_change, text) =>
    text === '' ? 'description section written' : `description section: "${text}"`,
};

/** What a change does, for a delivery's detail and the preview; `text` is the rendered template. */
export function describeChange<K extends PullRequestChangeKind>(
  change: ChangeOf<K>,
  text = '',
): string {
  return DESCRIBERS[change.kind](change, text);
}
