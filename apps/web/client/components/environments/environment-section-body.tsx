// The page of the Environments tab the URL names, one per part of how the previews run.
import type { ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import type { EnvironmentSection } from '../../lib/environments-url';
import { PreviewAgentPage } from './preview-agent-page';
import { PreviewComposePage } from './preview-compose-page';
import { PreviewE2ePage } from './preview-e2e-page';
import { PreviewLimitsPage } from './preview-limits-page';
import { PreviewSharedPage } from './preview-shared-page';
import { PreviewVariablesPage } from './preview-variables-page';

/** The open page of the tab. */
export function EnvironmentSectionBody({
  section,
  project,
}: {
  section: EnvironmentSection;
  project: PublicProject;
}): ReactElement {
  const bodies: Record<EnvironmentSection, () => ReactElement> = {
    compose: () => <PreviewComposePage project={project} />,
    variables: () => <PreviewVariablesPage project={project} />,
    agent: () => <PreviewAgentPage project={project} />,
    shared: () => <PreviewSharedPage project={project} />,
    e2e: () => <PreviewE2ePage project={project} />,
    limits: () => <PreviewLimitsPage project={project} />,
  };
  return bodies[section]();
}
