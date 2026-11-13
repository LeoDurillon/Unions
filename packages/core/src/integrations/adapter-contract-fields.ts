// The `fields` cases of the adapter contract: a value set by hand checked against the item, refused, sent. Test helper.

import { expect, test } from 'bun:test';

import type { TrackerAdapter } from './tracker-adapter';
import type { TrackerAccess } from './tracker-fields';
import { TrackerValueError } from './tracker-value-error';

/** An item of the fake with a settable field, a value it takes, and what the fake was sent. */
export type FieldsFixture = {
  adapter: TrackerAdapter;
  access: TrackerAccess;
  itemId: string;
  field: { id: string; value: string };
  /** How many changes the fake has been sent so far. */
  sent: () => number;
};

function fields(adapter: TrackerAdapter): NonNullable<TrackerAdapter['fields']> {
  if (!adapter.fields) {
    throw new Error('The adapter has no fields capability');
  }
  return adapter.fields;
}

async function refusal(work: Promise<unknown>): Promise<unknown> {
  try {
    await work;
    return null;
  } catch (error) {
    return error;
  }
}

export function fieldsCases({ adapter, access, itemId, field, sent }: FieldsFixture): void {
  const input = { fieldId: field.id, value: field.value, text: field.value, picks: [] };
  test('checks a value against the field as the item has it now', async () => {
    const checked = await fields(adapter).check(access, itemId, input);
    expect(checked.field.id).toBe(field.id);
    expect(checked.value).toBe(field.value);
  });
  test('refuses a field the item does not have, as gone', async () => {
    const error = await refusal(
      fields(adapter).check(access, itemId, { ...input, fieldId: 'gone' }),
    );
    expect(error).toBeInstanceOf(TrackerValueError);
    expect(error instanceof TrackerValueError && error.gone).toBe(true);
  });
  test('sends a checked change', async () => {
    const before = sent();
    const checked = await fields(adapter).check(access, itemId, input);
    await fields(adapter).set(access, { itemId, ...checked });
    expect(sent()).toBe(before + 1);
  });
  test("says why the tracker refused a change, in the error's words otherwise", () => {
    expect(fields(adapter).setFailure(new Error('Socket closed'), field.id)).toBe('Socket closed');
  });
}
