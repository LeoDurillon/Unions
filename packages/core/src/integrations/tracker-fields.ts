// A property of a tracker item set by hand, as every adapter's `fields` capability checks and sends it.
// The item is read when the change is checked, so the property's type is the tracker's now.

import type { TrackerFieldSet } from './tracker-field-set';
import type { TrackerProperty } from './tracker-property';
import { TrackerValueError } from './tracker-value-error';

/** The project's integration as the calls need it: its secret, config, and the columns it last read. */
export type TrackerAccess = { secret: string; config: unknown; fields: unknown };

/** `value` as a rule's value is written, `text` as the user reads it, `picks` what a picked field holds. */
export type TrackerFieldInput = {
  fieldId: string;
  value: string;
  text: string;
  picks: TrackerFieldSet['picks'];
};

/** What the command keeps of a checked change: the field as the item has it now, and the value. */
export type CheckedField = Pick<TrackerFieldSet, 'field' | 'value' | 'picks'>;

/** What the worker sends: the item, its field and the value. */
export type FieldChange = Pick<TrackerFieldSet, 'itemId' | 'field' | 'value' | 'picks'>;

/** The property the input names among the item's, read now; refused when gone or not settable. */
export function settableProperty(
  properties: readonly TrackerProperty[],
  input: TrackerFieldInput,
  tracker: string,
): TrackerProperty {
  const property = properties.find((one) => one.id === input.fieldId);
  if (!property) {
    throw new TrackerValueError(
      `This property is not on the ${tracker} item any more: refresh the tab`,
      true,
    );
  }
  if (!property.settable) {
    throw new TrackerValueError(`Union cannot set a ${tracker} ${property.type} field`);
  }
  return property;
}
