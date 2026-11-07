// A rule's value for a Jira field as Jira takes it, by the field's type, or why it cannot be one; checked when the
// rule is saved (values without variables) and when it runs (filled in).
import { unknownVariables } from '../event-rule-types';
import type { JiraFieldType } from './jira-field-types';
import { textAdf } from './text-adf';

/** Set the field to this (`fields`, null clears it), or add these labels (`update`). */
type JiraValue = { set: unknown } | { add: string[] };

/** Jira refuses longer values in a one-line text field. */
const MAX_TEXT = 255;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const WHITESPACE = /\s/u;
const ISO_UTC = /Z$/u;

type Shaped = JiraValue | { error: string };

function number(text: string): Shaped {
  const value = Number(text);
  return Number.isFinite(value) ? { set: value } : { error: `"${text}" is not a number` };
}

function date(text: string): Shaped {
  return DATE.test(text) && !Number.isNaN(Date.parse(text))
    ? { set: text }
    : { error: `"${text}" is not a date (YYYY-MM-DD)` };
}

/** Jira takes `2026-11-07T10:00:00.000+0000`; `{date.now}` gives ISO 8601 in UTC. */
function datetime(text: string): Shaped {
  const time = Date.parse(text);
  return Number.isNaN(time)
    ? { error: `"${text}" is not a date and time` }
    : { set: new Date(time).toISOString().replace(ISO_UTC, '+0000') };
}

function labels(text: string): Shaped {
  const list = text
    .split(',')
    .map((label) => label.trim())
    .filter((label) => label !== '');
  const spaced = list.find((label) => WHITESPACE.test(label));
  if (spaced !== undefined) {
    return { error: `A Jira label has no spaces: "${spaced}"` };
  }
  return list.length === 0 ? { error: 'Give the labels to add' } : { add: list };
}

const SHAPES: Record<JiraFieldType, (text: string) => Shaped> = {
  text: (text) =>
    text.length > MAX_TEXT
      ? { error: `A one-line Jira text holds at most ${MAX_TEXT} characters` }
      : { set: text },
  textarea: (text) => ({ set: textAdf(text) }),
  number,
  date,
  datetime,
  option: (text) => ({ set: { value: text } }),
  labels,
};

/** The filled-in value as Jira takes it; an empty value clears the field (labels have nothing to add). */
export function jiraFieldValue(type: JiraFieldType, value: string): Shaped {
  const text = value.trim();
  if (text === '' && type !== 'labels') {
    return { set: null };
  }
  return SHAPES[type](text);
}

/** Why a rule's value cannot be saved for a field of this type, or null; variables are checked once filled in. */
export function jiraValueError(type: JiraFieldType, value: string): string | null {
  const unknown = unknownVariables(value);
  if (unknown.length > 0) {
    return `Unknown variable: {${unknown.join('}, {')}}`;
  }
  if (value.includes('{')) {
    return type === 'option' ? 'An option is picked by its name, not with variables' : null;
  }
  const shaped = jiraFieldValue(type, value);
  return 'error' in shaped ? shaped.error : null;
}
