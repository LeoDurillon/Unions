// What a tracker tab sends to set one property, read from the request, and the checks both trackers share.

import type { TrackerFieldSet, TrackerProperty } from '@union/core';

import { BAD_REQUEST, fail, NOT_FOUND } from './http';

/** `value` as a rule's value is written, `text` as the user reads it, `picks` what a picked field holds. */
export type TrackerFieldInput = {
  fieldId: string;
  value: string;
  text: string;
  picks: TrackerFieldSet['picks'];
};

/** The item whose property is set, its project, and the tab it is set from: a ticket's or a review's. */
export type TrackerFieldTarget = {
  projectId: number;
  itemId: string;
  place: Pick<TrackerFieldSet, 'ticketId' | 'reviewId'>;
};

function picksOf(value: unknown): TrackerFieldSet['picks'] {
  const list: unknown[] = Array.isArray(value) ? value : [];
  return list.flatMap((pick) => {
    if (typeof pick !== 'object' || pick === null || !('id' in pick)) {
      return [];
    }
    const name = 'name' in pick && typeof pick.name === 'string' ? pick.name : '';
    return typeof pick.id === 'string' ? [{ id: pick.id, name: name || pick.id }] : [];
  });
}

export function trackerFieldInputOf(body: Record<string, unknown>): TrackerFieldInput {
  const { fieldId, value, text } = body;
  if (typeof fieldId !== 'string' || fieldId === '' || typeof value !== 'string') {
    throw fail(BAD_REQUEST, 'Name the property and its value');
  }
  const trimmed = value.trim();
  return {
    fieldId,
    value: trimmed,
    text: typeof text === 'string' ? text : trimmed,
    picks: picksOf(body.picks),
  };
}

/** The property the input names among the item's, read now; refused when gone or not settable. */
export function settableProperty(
  properties: TrackerProperty[],
  input: TrackerFieldInput,
  tracker: 'Notion' | 'Jira',
): TrackerProperty {
  const property = properties.find((one) => one.id === input.fieldId);
  if (!property) {
    throw fail(NOT_FOUND, `This property is not on the ${tracker} item any more: refresh the tab`);
  }
  if (!property.settable) {
    throw fail(BAD_REQUEST, `Union cannot set a ${tracker} ${property.type} field`);
  }
  return property;
}
