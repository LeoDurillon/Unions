// The New ticket form's Depends on row: the ticket it waits for, optional.

import type { ReactElement } from 'react';

import { ParentPicker } from '../ticket/parent-picker';
import { FormRow } from './form-row';

export function ParentField({
  projectId,
  value,
  onChange,
}: {
  projectId: number;
  value: number | null;
  onChange: (parentId: number | null) => void;
}): ReactElement {
  return (
    <FormRow label="Depends on">
      <ParentPicker projectId={projectId} ticketId={null} value={value} onChange={onChange} />
      <p className="mt-1 text-xs text-zinc-500">
        Optional. The ticket starts only once its parent is done, from the parent&apos;s branch.
      </p>
    </FormRow>
  );
}
