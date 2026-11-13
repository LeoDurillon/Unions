// A Jira issue's fields as its tab lists them: those of its edit screen, each value as text, and which Union can set.
// Read from `GET /issue/{key}?expand=editmeta`: the screen gives the names and types, `fields` the values.

import { adfMarkdown } from './adf-markdown';
import { fieldTypeOf } from './jira-field-types';
import { isRecord, text } from './jira-parse';
import { joined, shortDateTime, type TrackerProperty } from './tracker-property';

/** On the screen but not properties: the issue's text, its files, links, comments and work log. */
const LEFT_OUT = new Set([
  'summary',
  'description',
  'attachment',
  'issuelinks',
  'comment',
  'worklog',
  'timetracking',
  'project',
]);

/** The name an object of Jira's goes by: a user's, an option's, a version's, a sprint's. */
const NAME_KEYS = ['displayName', 'name', 'value', 'key'] as const;

const SPACES = /\s+/gu;

function objectText(value: Record<string, unknown>): string {
  if (value.type === 'doc') {
    return adfMarkdown(value).replaceAll(SPACES, ' ').trim();
  }
  const key = NAME_KEYS.find((name) => typeof value[name] === 'string' && value[name] !== '');
  return key ? text(value, key) : '';
}

/** A field's value as text, whatever its type; null and what Union cannot read are empty. */
function valueText(value: unknown): string {
  if (typeof value === 'string') {
    return shortDateTime(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return joined(value.map((item) => valueText(item)));
  }
  return isRecord(value) ? objectText(value) : '';
}

function schemaOf(field: Record<string, unknown>): { type: string; items: string; custom: string } {
  const schema = isRecord(field.schema) ? field.schema : {};
  return {
    type: text(schema, 'type'),
    items: text(schema, 'items'),
    custom: text(schema, 'custom'),
  };
}

/** A select's or checkboxes' options, as the edit screen lists them. */
function optionsOf(field: Record<string, unknown>): string[] {
  const allowed = Array.isArray(field.allowedValues) ? field.allowedValues : [];
  return allowed.flatMap((option: unknown) =>
    isRecord(option) && typeof option.value === 'string' ? [option.value] : [],
  );
}

/** The status, first: it is not on the edit screen, Jira moves it through the workflow. */
function statusRow(fields: Record<string, unknown>): TrackerProperty[] {
  const status = valueText(fields.status);
  return status === ''
    ? []
    : [
        {
          id: 'status',
          name: 'Status',
          type: 'status',
          text: status,
          value: status,
          options: [],
          settable: false,
        },
      ];
}

/** The issue's status, then the fields of its edit screen in Jira's order, its text and files left out. */
export function issuePropertiesOf(body: unknown): TrackerProperty[] {
  const issue = isRecord(body) ? body : {};
  const fields = isRecord(issue.fields) ? issue.fields : {};
  const screen =
    isRecord(issue.editmeta) && isRecord(issue.editmeta.fields) ? issue.editmeta.fields : {};
  const rows = Object.entries(screen).flatMap(([id, field]): TrackerProperty[] => {
    if (LEFT_OUT.has(id) || !isRecord(field)) {
      return [];
    }
    const schema = schemaOf(field);
    const type = fieldTypeOf(id, schema);
    const shown = valueText(fields[id]);
    return [
      {
        id,
        name: text(field, 'name') || id,
        type: type ?? schema.type,
        text: shown,
        value: shown,
        options: optionsOf(field),
        settable: type !== null,
      },
    ];
  });
  return [...statusRow(fields), ...rows];
}
