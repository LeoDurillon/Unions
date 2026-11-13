// What a rule's tracker action does, as its sentence ends: "move the Jira issue to In Review", "comment on …".
import type { NotionSchema } from '@union/core';
import type { TrackerAction } from '@union/core/event-tracker-actions';
import { integrationKind } from '@union/core/integration-kinds';
import type { ReactElement } from 'react';

import { TRACKER_RULE_EDITORS } from '../integrations/tracker-rule-editors';

export function TrackerActionText({
  projectId,
  notion,
  action,
}: {
  projectId: number;
  notion: NotionSchema | null;
  action: TrackerAction;
}): ReactElement {
  const { label, itemLabel } = integrationKind(action.tracker);
  if (action.kind === 'tracker_status') {
    return (
      <>
        move the {label} {itemLabel} to {action.statusName}
      </>
    );
  }
  if (action.kind === 'tracker_fields') {
    const { FieldsText } = TRACKER_RULE_EDITORS[action.tracker];
    return <FieldsText projectId={projectId} notion={notion} action={action} />;
  }
  return (
    <>
      comment on the {label} {itemLabel}: <code className="font-mono">{action.body}</code>
    </>
  );
}
