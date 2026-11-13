// Jira's field types as shared field types (`tracker-field-types.ts`), with what the inputs say about each; browser-safe.
// An option is picked by its name, checked against the issue when a rule runs; the status moves through a transition.

import { fieldShape, type TrackerFieldShape } from './tracker-field-types';

const EMPTY_CLEARS = 'Empty clears the field.';

const SHAPES: Record<string, TrackerFieldShape> = {
  text: fieldShape('text', { ruleHint: 'One line; variables are filled in when it runs.' }),
  textarea: fieldShape('textarea', {
    placeholder: 'Merged in {pr.url}',
    ruleHint: 'Several lines; links become links.',
  }),
  number: fieldShape('number', {
    placeholder: '{pr.number}',
    ruleHint: 'A number, or a variable that gives one.',
  }),
  date: fieldShape('date', {
    placeholder: '{date.today}',
    ruleHint: 'YYYY-MM-DD, or {date.today}.',
  }),
  datetime: fieldShape('datetime', {
    placeholder: '{date.now}',
    ruleHint: 'An ISO date and time, or {date.now}.',
  }),
  option: fieldShape('select', {
    variables: false,
    placeholder: "The option's name, as Jira shows it",
    ruleHint: `Checked against the issue when the rule runs. ${EMPTY_CLEARS}`,
    handHint: `The option's name, as Jira shows it. ${EMPTY_CLEARS}`,
  }),
  labels: fieldShape('labels', {
    placeholder: 'qa, deployed',
    ruleHint: 'Added to the issue, comma-separated; a label has no spaces.',
    handHint: 'Comma-separated; they replace the issue’s labels. A label has no spaces.',
  }),
  multi_option: fieldShape('multi_select', {
    variables: false,
    placeholder: 'Web, iOS',
    ruleHint: `Option names as Jira shows them, comma-separated; they replace the checked ones. Checked against the issue when the rule runs. ${EMPTY_CLEARS}`,
    handHint: `Option names as Jira shows them, comma-separated. ${EMPTY_CLEARS}`,
  }),
  user: fieldShape('picked', {
    single: true,
    variables: false,
    ruleHint: 'One of the people who can be assigned in the Jira project.',
  }),
  versions: fieldShape('picked', {
    variables: false,
    ruleHint: "The project's versions; they replace the field's, and none checked empties it.",
  }),
  components: fieldShape('picked', {
    variables: false,
    ruleHint: "The project's components; they replace the field's, and none checked empties it.",
  }),
  sprint: fieldShape('picked', {
    single: true,
    variables: false,
    ruleHint:
      "The active or next sprint is the board's when the rule runs, so the rule keeps working from sprint to sprint.",
  }),
  status: fieldShape('move', { variables: false }),
};

export function jiraFieldShape(type: string): TrackerFieldShape | null {
  return Object.hasOwn(SHAPES, type) ? (SHAPES[type] ?? null) : null;
}
