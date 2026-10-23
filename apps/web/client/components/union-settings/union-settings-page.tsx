// The settings every project shares: a page per agent, the tools, the GitHub App (`?union=`).
import { useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import { api } from '../../lib/api';
import type { UnionSection } from '../../lib/union-settings-groups';
import { SettingsFrame } from '../settings/settings-frame';
import { UnionSectionBody } from './union-section-body';
import { unionSectionLabel } from './union-section-labels';
import { UnionSettingsNav } from './union-settings-nav';

/** The settings every project shares: a page per agent, the tools, the GitHub App (`?union=`). */
export function UnionSettingsPage({
  section,
  onBack,
}: {
  section: UnionSection;
  onBack: () => void;
}): ReactElement {
  const agents = useQuery({ queryKey: ['agents'], queryFn: api.agents }).data ?? [];
  return (
    <SettingsFrame
      title="Union settings"
      subtitle={unionSectionLabel(section, agents)}
      pageKey={section}
      nav={<UnionSettingsNav agents={agents} section={section} />}
      onBack={onBack}
    >
      <UnionSectionBody section={section} />
    </SettingsFrame>
  );
}
