// Sets one property of a tracker item, typed by hand in a tab, through the tracker's adapter, and logs how it went.
import {
  integrationKind,
  integrationOf,
  trackerAdapter,
  type Db,
  type IntegrationApis,
  type TrackerFieldSet,
} from '@union/core';

import { logFieldOutcome } from './tracker-field-outcome';

/** Null when the tracker has the value now, else why not. */
async function attempt(
  db: Db,
  apis: IntegrationApis,
  change: TrackerFieldSet,
): Promise<string | null> {
  const integration = integrationOf(db, change.projectId, change.kind);
  const { fields } = trackerAdapter(change.kind, apis);
  const { label } = integrationKind(change.kind);
  if (!integration) {
    return `This project is not connected to ${label}`;
  }
  if (!fields) {
    return `Union does not set the fields of ${label}`;
  }
  const access = {
    secret: integration.secret,
    config: integration.config,
    fields: integration.fields,
  };
  try {
    await fields.set(access, change);
    return null;
  } catch (error) {
    return fields.setFailure(error, change.field.id);
  }
}

/**
 * Sets the property of the `set_tracker_fields` command `commandId` with the project's secret for its
 * tracker; `tracker_field_set` or `tracker_field_failed` says how it went.
 */
export async function setTrackerField(
  db: Db,
  apis: IntegrationApis,
  commandId: number,
  change: TrackerFieldSet,
): Promise<void> {
  logFieldOutcome(db, commandId, change, await attempt(db, apis, change));
}
