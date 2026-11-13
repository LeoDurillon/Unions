// What a tracker tab sends to set one property: read from the request, checked by the tracker's adapter, queued.

import {
  integrationKind,
  integrationOf,
  trackerAdapter,
  type Db,
  type IntegrationApis,
  type IntegrationKindName,
  type TrackerFieldInput,
  type TrackerFieldSet,
} from '@union/core';

import { BAD_REQUEST, CONFLICT, fail, NOT_FOUND } from './http';
import { guarded } from './routes/tracker-errors';
import { queueTrackerField } from './tracker-field-commands';

/** The item whose property is set, its tracker and project, and the tab it is set from: a ticket's or a review's. */
export type TrackerFieldTarget = {
  kind: IntegrationKindName;
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

/** Reads the item now (the property's type is the tracker's), checks the value as the worker will send it, queues it. */
export async function queueFieldChange(
  db: Db,
  apis: IntegrationApis,
  target: TrackerFieldTarget,
  input: TrackerFieldInput,
): Promise<number> {
  const { kind, projectId, itemId } = target;
  const integration = integrationOf(db, projectId, kind);
  if (!integration) {
    throw fail(CONFLICT, `The project is not connected to ${integrationKind(kind).label}`);
  }
  const { fields } = trackerAdapter(kind, apis);
  if (!fields) {
    throw fail(NOT_FOUND, `Union does not set the fields of ${integrationKind(kind).label}`);
  }
  const access = {
    secret: integration.secret,
    config: integration.config,
    fields: integration.fields,
  };
  const checked = await guarded(() => fields.check(access, itemId, input));
  return queueTrackerField(db, {
    projectId,
    kind,
    itemId,
    ...target.place,
    ...checked,
    text: input.text,
  });
}
