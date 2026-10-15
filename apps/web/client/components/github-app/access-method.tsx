import type { ReactElement } from 'react';

import { Segmented, type SegmentOption } from '../choice';

export type AccessMethod = 'token' | 'app';

const METHODS: SegmentOption<AccessMethod>[] = [
  { value: 'token', label: 'Personal access token' },
  { value: 'app', label: 'GitHub App' },
];

/** Token or GitHub App: the two ways a project can reach GitHub. */
export function AccessMethodTabs({
  method,
  onChange,
}: {
  method: AccessMethod;
  onChange: (method: AccessMethod) => void;
}): ReactElement {
  return (
    <Segmented
      legend="GitHub access"
      size="sm"
      options={METHODS}
      value={method}
      onChange={onChange}
    />
  );
}
