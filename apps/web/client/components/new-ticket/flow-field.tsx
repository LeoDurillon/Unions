// The New ticket dialog's Flow row: the flow picker, shared by the Write and import tabs.

import type { PipelineStep } from '@union/core/states';
import type { ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { FlowPicker } from '../flow/flow-picker';
import { FormRow } from './form-row';

export function FlowField({
  project,
  value,
  onChange,
}: {
  project: PublicProject;
  value: PipelineStep[] | null;
  onChange: (flow: PipelineStep[] | null) => void;
}): ReactElement {
  return (
    <FormRow label="Flow">
      <FlowPicker config={project.config} value={value} onChange={onChange} />
    </FormRow>
  );
}
