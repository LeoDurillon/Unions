// What a rule does: the kind of action, then that kind's own fields.
import type { NotionSchema } from '@union/core';
import type { EventAction } from '@union/core/event-actions';
import type { ReactElement } from 'react';

import { ActionKindSelect } from './action-kind-select';
import { GitHubCommentFields } from './github-comment-fields';
import { ProjectFieldsFields } from './project-fields-fields';
import { PullRequestFields } from './pull-request-fields';
import { TrackerActionFields } from './tracker-action-fields';
import { UnionNotificationFields } from './union-notification-fields';

/** The fields of the action's own kind. */
function KindFields({
  projectId,
  notion,
  action,
  onChange,
}: {
  projectId: number;
  notion: NotionSchema | null;
  action: EventAction;
  onChange: (action: EventAction) => void;
}): ReactElement {
  if ('tracker' in action) {
    return (
      <TrackerActionFields
        projectId={projectId}
        notion={notion}
        action={action}
        onChange={onChange}
      />
    );
  }
  if (action.kind === 'union_notification') {
    return <UnionNotificationFields action={action} onChange={onChange} />;
  }
  if (action.kind === 'github_pull_request') {
    return <PullRequestFields projectId={projectId} action={action} onChange={onChange} />;
  }
  if (action.kind === 'github_project_fields') {
    return <ProjectFieldsFields projectId={projectId} action={action} onChange={onChange} />;
  }
  return <GitHubCommentFields projectId={projectId} action={action} onChange={onChange} />;
}

export function ActionFields({
  projectId,
  notion,
  action,
  onChange,
}: {
  projectId: number;
  notion: NotionSchema | null;
  action: EventAction;
  onChange: (action: EventAction) => void;
}): ReactElement {
  return (
    <>
      <ActionKindSelect projectId={projectId} action={action} onChange={onChange} />
      <KindFields projectId={projectId} notion={notion} action={action} onChange={onChange} />
    </>
  );
}
