// Notion's parts of the rule editor: its columns bar, its properties' editor and sentence; it takes no status move.

import type { TrackerRuleEditor } from '../tracker-rule-editor-types';
import { NotionActionFields } from './notion-action-fields';
import { NotionFieldsText } from './notion-action-text';
import { NotionColumnsBar } from './notion-columns-bar';

export const NOTION_RULE_PARTS: TrackerRuleEditor = {
  Bar: ({ projectId, data, onRefreshed }) => (
    <NotionColumnsBar projectId={projectId} notion={data.notion} onRefreshed={onRefreshed} />
  ),
  Fields: NotionActionFields,
  Status: null,
  FieldsText: NotionFieldsText,
};
