// Notion's property types as shared field types (`tracker-field-types.ts`); the types rules cannot set have none.
// Browser-safe. A select takes new options, which Notion creates; a status only its own.

import { fieldShape, type TrackerFieldShape } from './tracker-field-types';

const SHAPES: Record<string, TrackerFieldShape> = {
  rich_text: fieldShape('textarea'),
  url: fieldShape('url'),
  number: fieldShape('number', { placeholder: '{pr.number}' }),
  select: fieldShape('select', { newOptions: true, placeholder: '{board.status}' }),
  multi_select: fieldShape('multi_select', { newOptions: true }),
  status: fieldShape('select', { variables: false }),
  checkbox: fieldShape('checkbox', { placeholder: 'true' }),
  date: fieldShape('date', { placeholder: '{date.today}' }),
  email: fieldShape('email'),
  phone_number: fieldShape('phone'),
  people: fieldShape('people', { variables: false }),
};

export function notionFieldShape(type: string): TrackerFieldShape | null {
  return Object.hasOwn(SHAPES, type) ? (SHAPES[type] ?? null) : null;
}
