/**
 * Event rules: when something happens to a ticket, do something elsewhere. Browser-safe (no
 * database): the settings page uses the same triggers, variables and value checks as the worker.
 */
import { BOARD_STATUSES, STEPS, type BoardStatus, type Step } from './states';

export type EventTrigger =
  | { kind: 'pull_request_linked' }
  | { kind: 'pull_request_ready' }
  | { kind: 'pull_request_merged' }
  | { kind: 'pull_request_closed' }
  | { kind: 'board_status'; status: BoardStatus }
  /** `step` null: any step. */
  | { kind: 'awaiting_approval'; step: Step | null }
  | { kind: 'step_failed' }
  | { kind: 'ticket_created' };

export const TRIGGER_KINDS = [
  'pull_request_linked',
  'pull_request_ready',
  'pull_request_merged',
  'pull_request_closed',
  'board_status',
  'awaiting_approval',
  'step_failed',
  'ticket_created',
] as const satisfies readonly EventTrigger['kind'][];

export const TRIGGER_LABELS: Record<EventTrigger['kind'], string> = {
  pull_request_linked: 'The ticket gets a pull request',
  pull_request_ready: 'Its pull request is ready for review',
  pull_request_merged: 'Its pull request is merged',
  pull_request_closed: 'Its pull request is closed without merging',
  board_status: 'The ticket moves to a board column',
  awaiting_approval: 'A step waits for your approval',
  step_failed: 'A step fails',
  ticket_created: 'The ticket is created',
};

export const BOARD_LABELS: Record<BoardStatus, string> = {
  backlog: 'Backlog',
  in_progress: 'In progress',
  in_review: 'In review',
  done: 'Done',
};

/** What a value template can use, as `{name}`. */
export const TEMPLATE_VARIABLES = [
  { name: 'pr.url', description: 'Link to the pull request' },
  { name: 'pr.number', description: 'Pull request number' },
  { name: 'ticket.title', description: 'Ticket title' },
  { name: 'ticket.id', description: 'Union ticket number' },
  { name: 'ticket.branch', description: 'Branch name' },
  { name: 'issue.number', description: 'GitHub issue number' },
  { name: 'issue.url', description: 'Link to the GitHub issue' },
  { name: 'board.status', description: 'Board column (Backlog, In progress, In review, Done)' },
  { name: 'step', description: 'The step that waits or failed' },
  { name: 'date.today', description: "Today's date (YYYY-MM-DD)" },
  { name: 'date.now', description: 'Date and time (ISO 8601)' },
] as const;

export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number]['name'];

/** Notion property types a rule can set. */
export const WRITABLE_NOTION_TYPES = [
  'rich_text',
  'url',
  'number',
  'select',
  'multi_select',
  'status',
  'checkbox',
  'date',
  'email',
  'phone_number',
  'people',
] as const;

const VARIABLE = /\{(?<name>[a-z.]+)\}/gu;

export function isTrigger(value: unknown): value is EventTrigger {
  if (typeof value !== 'object' || value === null || !('kind' in value)) {
    return false;
  }
  const trigger = value as Record<string, unknown>;
  if (trigger.kind === 'board_status') {
    return BOARD_STATUSES.some((status) => status === trigger.status);
  }
  if (trigger.kind === 'awaiting_approval') {
    return trigger.step === null || STEPS.some((step) => step === trigger.step);
  }
  return TRIGGER_KINDS.some((kind) => kind === trigger.kind);
}

/** The `{names}` of a template that are not variables. */
export function unknownVariables(template: string): string[] {
  const known = new Set<string>(TEMPLATE_VARIABLES.map((variable) => variable.name));
  return [...template.matchAll(VARIABLE)]
    .map((match) => match.groups?.name ?? '')
    .filter((name) => !known.has(name));
}

function isVariable(name: string): name is TemplateVariable {
  return TEMPLATE_VARIABLES.some((variable) => variable.name === name);
}

/** The template with its variables replaced; a variable without a value reads as empty. */
export function renderTemplate(
  template: string,
  values: Partial<Record<TemplateVariable, string>>,
): string {
  return template
    .replaceAll(VARIABLE, (_match, name: string) => (isVariable(name) ? (values[name] ?? '') : ''))
    .trim();
}

const TRUE = new Set(['true', 'yes', '1', 'checked', 'x']);
const FALSE = new Set(['false', 'no', '0', '']);
const DATE = /^\d{4}-\d{2}-\d{2}(?:T[\d:.]+(?:Z|[+-]\d{2}:\d{2})?)?$/u;
const MAX_TEXT = 2000;
const USER_ID = /^[\da-f]{8}-?[\da-f]{4}-?[\da-f]{4}-?[\da-f]{4}-?[\da-f]{12}$/iu;

type Shaped = { value: unknown } | { error: string };

function text(content: string): unknown {
  return content === '' ? [] : [{ type: 'text', text: { content: content.slice(0, MAX_TEXT) } }];
}

function choice(type: 'select' | 'status', value: string, options: string[]): Shaped {
  if (value === '') {
    return { value: { [type]: null } };
  }
  if (type === 'status' && !options.includes(value)) {
    return { error: `"${value}" is not a status of this property (${options.join(', ')})` };
  }
  return { value: { [type]: { name: value } } };
}

function numberValue(value: string): Shaped {
  const number = Number(value);
  return value === '' || Number.isFinite(number)
    ? { value: { number: value === '' ? null : number } }
    : { error: `"${value}" is not a number` };
}

function checkboxValue(value: string): Shaped {
  const lower = value.toLowerCase();
  return TRUE.has(lower) || FALSE.has(lower)
    ? { value: { checkbox: TRUE.has(lower) } }
    : { error: `"${value}" is not a yes or no` };
}

function dateValue(value: string): Shaped {
  return value === '' || DATE.test(value)
    ? { value: { date: value === '' ? null : { start: value } } }
    : { error: `"${value}" is not a date (YYYY-MM-DD)` };
}

const SCALARS: Record<string, (value: string) => Shaped> = {
  number: numberValue,
  checkbox: checkboxValue,
  date: dateValue,
};

/** url, email, phone_number take the text as is; number, checkbox and date are parsed. */
function scalar(type: string, value: string): Shaped {
  const parse = SCALARS[type];
  return parse ? parse(value) : { value: { [type]: value === '' ? null : value } };
}

/** Comma-separated names (multi-select) or ids (people). */
function listOf(value: string): string[] {
  return value
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name !== '');
}

/** Notion user ids, as the settings page picks them; empty clears the property. */
function peopleValue(value: string): Shaped {
  const ids = listOf(value);
  const wrong = ids.find((id) => !USER_ID.test(id));
  return wrong === undefined
    ? { value: { people: ids.map((id) => ({ object: 'user', id })) } }
    : { error: `"${wrong}" is not a Notion user: pick people from the list` };
}

/** The value as Notion expects it for a property of `type`, or why it cannot be one. */
export function notionPropertyValue(
  property: { type: string; options: string[] },
  value: string,
): Shaped {
  switch (property.type) {
    case 'rich_text': {
      return { value: { rich_text: text(value) } };
    }
    case 'select':
    case 'status': {
      return choice(property.type, value, property.options);
    }
    case 'multi_select': {
      return { value: { multi_select: listOf(value).map((name) => ({ name })) } };
    }
    case 'people': {
      return peopleValue(value);
    }
    default: {
      return WRITABLE_NOTION_TYPES.some((type) => type === property.type)
        ? scalar(property.type, value)
        : { error: `Notion ${property.type} properties cannot be set by a rule` };
    }
  }
}
