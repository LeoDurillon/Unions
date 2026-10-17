import type { ReactElement } from 'react';

import { UNION_SETTINGS_GROUPS, type UnionSection } from '../../lib/union-settings-groups';
import { openUnionSettings } from '../../lib/union-settings-sections';
import { SettingsFrame } from '../settings/settings-frame';
import { SettingsNav, type NavGroup } from '../settings/settings-nav';
import { UnionSectionBody } from './union-section-body';
import { unionSectionLabel } from './union-section-labels';

const GROUPS: readonly NavGroup<UnionSection>[] = UNION_SETTINGS_GROUPS.map((group) => ({
  label: group.label,
  sections: group.sections.map((id) => ({ id, label: unionSectionLabel(id) })),
}));

/** The settings every project shares: a page per agent, the tools, the GitHub App (`?union=`). */
export function UnionSettingsPage({
  section,
  onBack,
}: {
  section: UnionSection;
  onBack: () => void;
}): ReactElement {
  return (
    <SettingsFrame
      title="Union settings"
      subtitle={unionSectionLabel(section)}
      pageKey={section}
      nav={
        <SettingsNav
          label="Union settings"
          groups={GROUPS}
          section={section}
          onOpen={openUnionSettings}
        />
      }
      onBack={onBack}
    >
      <UnionSectionBody section={section} />
    </SettingsFrame>
  );
}
