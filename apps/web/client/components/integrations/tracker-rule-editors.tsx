// Each tracker's parts of the rule editor: its fields' editor and sentence, and its status editor when it has one.
// The settings ask for a tracker's part here, never for a tracker by name; the comment's is shared.
import type { NotionSchema } from '@union/core';
import type { EventAction } from '@union/core/event-actions';
import type { TrackerActionOf } from '@union/core/event-tracker-actions';
import type { IntegrationKindName } from '@union/core/integration-kinds';
import type { ReactElement } from 'react';

import { JiraFieldsEditor, JiraStatusEditor } from './jira/jira-action-fields';
import { JiraFieldsText } from './jira/jira-action-text';
import { NotionActionFields } from './notion/notion-action-fields';
import { NotionFieldsText } from './notion/notion-action-text';

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

type TrackerRuleEditor = {
  Fields: Editor<'tracker_fields'>;
  /** Null for a tracker that takes no `tracker_status` (its kind's `ruleActions`). */
  Status: Editor<'tracker_status'> | null;
  FieldsText: FieldsText;
};

export const TRACKER_RULE_EDITORS: Record<IntegrationKindName, TrackerRuleEditor> = {
  notion: {
    Fields: NotionActionFields,
    Status: null,
    FieldsText: NotionFieldsText,
  },
  jira: {
    Fields: JiraFieldsEditor,
    Status: JiraStatusEditor,
    FieldsText: JiraFieldsText,
  },
};
