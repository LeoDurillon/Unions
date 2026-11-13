// Jira's parts of the rule editor: its fields bar, its fields' editor and sentence, and its status move.

import type { TrackerRuleEditor } from '../tracker-rule-editor-types';
import { JiraFieldsEditor, JiraStatusEditor } from './jira-action-fields';
import { JiraFieldsText } from './jira-action-text';
import { JiraFieldsBar } from './jira-fields-bar';

export const JIRA_RULE_PARTS: TrackerRuleEditor = {
  Bar: ({ projectId, data, onRefreshed }) =>
    data.jira ? (
      <JiraFieldsBar projectId={projectId} source={data.jira} onRefreshed={onRefreshed} />
    ) : null,
  Fields: JiraFieldsEditor,
  Status: JiraStatusEditor,
  FieldsText: JiraFieldsText,
};
