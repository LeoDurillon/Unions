// A value typed for a tracker's property as the user reads it: names for people's ids, Yes or No for a box.

import { splitChoices } from '../settings/choice-values';

/** `value` as a rule's value is written for a Notion property of `type`, read as text; `members` names people. */
export function notionValueText(
  type: string,
  value: string,
  members: { id: string; name: string }[],
): string {
  if (type === 'checkbox') {
    return value === 'true' ? 'Yes' : 'No';
  }
  if (type === 'people') {
    return splitChoices(value)
      .map((id) => members.find((member) => member.id === id)?.name ?? id)
      .join(', ');
  }
  return value.trim();
}
