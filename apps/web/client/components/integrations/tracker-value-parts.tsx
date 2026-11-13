// Each tracker's own value inputs, for the shared types whose lists only it gives: people, picks, a status move.
// The shared value input (`tracker-value-input.tsx`) asks for them here by type, never for a tracker by name.

import type { IntegrationKindName } from '@union/core/integration-kinds';
import { isJiraFieldType, isPickedType } from '@union/core/jira-field-types';
import type { ReactElement } from 'react';

import type { TrackerDraft } from '../../lib/integrations/tracker-draft';
import { notionValueText } from '../../lib/integrations/tracker-value-text';
import { useNotionUsers } from '../../lib/integrations/use-notion-users';
import { PeopleField } from '../settings/people-field';
import { JiraPickField } from './jira/jira-pick-field';
import { JiraStatusInput } from './jira/jira-status-input';

type Pick = { id: string; name: string };

type PeopleInput = (props: {
  projectId: number;
  value: string;
  /** The ids as a rule's value holds them, and their names. */
  onChange: (value: string, text: string) => void;
}) => ReactElement;

type PickedInput = (props: {
  projectId: number;
  label: string;
  /** The tracker's type of the field (`user`, `sprint`…). */
  type: string;
  picks: Pick[];
  onChange: (picks: Pick[]) => void;
}) => ReactElement | null;

type MoveInput = (props: {
  url: string;
  draft: TrackerDraft;
  onChange: (draft: TrackerDraft) => void;
}) => ReactElement;

type TrackerValueParts = {
  People: PeopleInput | null;
  Picked: PickedInput | null;
  Move: MoveInput | null;
};

function NotionPeople({ projectId, value, onChange }: Parameters<PeopleInput>[0]): ReactElement {
  const members = useNotionUsers(projectId).data ?? [];
  return (
    <PeopleField
      projectId={projectId}
      value={value}
      onChange={(next) => {
        onChange(next, notionValueText('people', next, members));
      }}
    />
  );
}

function JiraPicked({ type, ...props }: Parameters<PickedInput>[0]): ReactElement | null {
  return isJiraFieldType(type) && isPickedType(type) ? (
    <JiraPickField type={type} {...props} />
  ) : null;
}

export const TRACKER_VALUE_PARTS: Record<IntegrationKindName, TrackerValueParts> = {
  notion: { People: NotionPeople, Picked: null, Move: null },
  jira: { People: null, Picked: JiraPicked, Move: JiraStatusInput },
};
