// What each tracker gives the rule editor: its columns bar, its fields' editor and sentence, its status editor.

import type { NotionSchema } from '@union/core';
import type { EventAction } from '@union/core/event-actions';
import type { TrackerActionOf } from '@union/core/event-tracker-actions';
import type { ReactElement } from 'react';

import type { EventRulesResponse } from '../../../src/event-api-types';

type Editor<K extends 'tracker_status' | 'tracker_fields'> = (props: {
  projectId: number;
  notion: NotionSchema | null;
  action: TrackerActionOf<K>;
  onChange: (action: EventAction) => void;
}) => ReactElement;

type FieldsText = (props: {
  projectId: number;
  notion: NotionSchema | null;
  action: TrackerActionOf<'tracker_fields'>;
}) => ReactElement;

/** Above the rules: the tracker's columns or fields as last read, and Refresh. */
type Bar = (props: {
  projectId: number;
  data: EventRulesResponse;
  onRefreshed: () => Promise<void>;
}) => ReactElement | null;

export type TrackerRuleEditor = {
  Bar: Bar;
  Fields: Editor<'tracker_fields'>;
  /** Null for a tracker that takes no `tracker_status` (its kind's `ruleActions`). */
  Status: Editor<'tracker_status'> | null;
  FieldsText: FieldsText;
};
