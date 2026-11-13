// The new value of a Notion page's property in its tab: the rule editor's input without variables, read as text.

import type { TrackerProperty } from '@union/core';
import type { ReactElement } from 'react';

import type { TrackerDraft } from '../../lib/integrations/tracker-draft';
import { notionValueText } from '../../lib/integrations/tracker-value-text';
import { useNotionUsers } from '../../lib/integrations/use-notion-users';
import { ValueField } from '../settings/value-field';

export function NotionPropertyInput({
  projectId,
  property,
  draft,
  onChange,
}: {
  projectId: number;
  property: TrackerProperty;
  draft: TrackerDraft;
  onChange: (draft: TrackerDraft) => void;
}): ReactElement {
  const members = useNotionUsers(projectId, property.type === 'people').data ?? [];
  return (
    <ValueField
      projectId={projectId}
      property={{
        id: property.id,
        name: property.name,
        type: property.type,
        options: property.options,
      }}
      value={draft.value}
      variables={false}
      onChange={(value) => {
        onChange({ value, picks: [], text: notionValueText(property.type, value, members) });
      }}
    />
  );
}
