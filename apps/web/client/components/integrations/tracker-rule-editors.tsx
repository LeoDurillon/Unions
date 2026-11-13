// Each tracker's parts of the rule editor, by kind: its columns bar, fields' editor and sentence, status editor.
// The settings ask for a tracker's part here, never for a tracker by name; the comment's is shared.
import type { IntegrationKindName } from '@union/core/integration-kinds';

import { JIRA_RULE_PARTS } from './jira/jira-rule-parts';
import { NOTION_RULE_PARTS } from './notion/notion-rule-parts';
import type { TrackerRuleEditor } from './tracker-rule-editor-types';

export const TRACKER_RULE_EDITORS: Record<IntegrationKindName, TrackerRuleEditor> = {
  notion: NOTION_RULE_PARTS,
  jira: JIRA_RULE_PARTS,
};
