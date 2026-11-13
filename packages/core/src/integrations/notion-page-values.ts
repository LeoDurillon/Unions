// A Notion page's properties as its tab lists them: each one's value as text, and whether Union can set it.
// Read from the page object (`GET /v1/pages/{id}`); the title is the card's heading, not a row.

import { WRITABLE_NOTION_TYPES } from '../event/event-rule-types';
import { isRecord, plain } from './notion-values';
import { joined, shortDateTime, type TrackerProperty } from './tracker-property';

type Reader = (value: unknown) => string;

/** The types a page has no value of to show: the title (the heading) and buttons. */
const LEFT_OUT = new Set(['title', 'button']);

function nameOf(value: unknown): string {
  return isRecord(value) && typeof value.name === 'string' ? value.name : '';
}

function names(value: unknown): string {
  return Array.isArray(value) ? joined(value.map((item) => nameOf(item))) : '';
}

function scalar(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

/** `2026-11-13`, or `2026-11-13 → 2026-11-20` for a range. */
function date(value: unknown): string {
  if (!isRecord(value) || typeof value.start !== 'string') {
    return '';
  }
  const start = shortDateTime(value.start);
  return typeof value.end === 'string' ? `${start} → ${shortDateTime(value.end)}` : start;
}

function count(value: unknown, noun: string): string {
  if (!Array.isArray(value) || value.length === 0) {
    return '';
  }
  return value.length === 1 ? `1 ${noun}` : `${value.length} ${noun}s`;
}

function yesNo(value: unknown): string {
  return value === true ? 'Yes' : 'No';
}

/** A formula's or a rollup's result: `{ type, [type]: value }`. */
function computed(value: unknown): string {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return '';
  }
  const result = value[value.type];
  if (value.type === 'boolean') {
    return yesNo(result);
  }
  if (value.type === 'date') {
    return date(result);
  }
  return value.type === 'array' ? count(result, 'item') : scalar(result);
}

function uniqueId(value: unknown): string {
  if (!isRecord(value) || typeof value.number !== 'number') {
    return '';
  }
  return typeof value.prefix === 'string'
    ? `${value.prefix}-${value.number}`
    : String(value.number);
}

const READERS: Record<string, Reader> = {
  rich_text: plain,
  number: scalar,
  url: scalar,
  email: scalar,
  phone_number: scalar,
  created_time: (value) => shortDateTime(scalar(value)),
  last_edited_time: (value) => shortDateTime(scalar(value)),
  select: nameOf,
  status: nameOf,
  created_by: nameOf,
  last_edited_by: nameOf,
  multi_select: names,
  people: names,
  files: names,
  date,
  checkbox: yesNo,
  formula: computed,
  rollup: computed,
  relation: (value) => count(value, 'page'),
  unique_id: uniqueId,
  verification: (value) => (isRecord(value) ? scalar(value.state) : ''),
};

/** The values an edit starts from where they differ from the text: ids, `true`, a date as Notion gives it. */
const VALUE_READERS: Record<string, Reader> = {
  people: (value) =>
    Array.isArray(value)
      ? joined(value.map((person) => (isRecord(person) ? scalar(person.id) : '')))
      : '',
  checkbox: (value) => String(value === true),
  date: (value) => (isRecord(value) ? scalar(value.start) : ''),
};

const SETTABLE: ReadonlySet<string> = new Set(WRITABLE_NOTION_TYPES);

/**
 * The page object's `properties`, in Notion's order, the title left out. The page does not give a
 * choice's options: the caller adds them from the data source's columns.
 */
export function pagePropertiesOf(properties: unknown): TrackerProperty[] {
  if (!isRecord(properties)) {
    return [];
  }
  return Object.entries(properties).flatMap(([name, property]) => {
    if (!isRecord(property) || typeof property.type !== 'string' || LEFT_OUT.has(property.type)) {
      return [];
    }
    const { type } = property;
    const id = typeof property.id === 'string' ? property.id : name;
    const text = READERS[type]?.(property[type]) ?? '';
    return [
      {
        id,
        name,
        type,
        text,
        value: VALUE_READERS[type]?.(property[type]) ?? text,
        options: [],
        settable: SETTABLE.has(type),
      },
    ];
  });
}
