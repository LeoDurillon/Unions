// The open Union settings page: an agent's, or the models', tools', connectors' or GitHub App's.
import type { AgentId } from '@union/core';
import { isCustomStep } from '@union/core/states';
import type { ReactElement } from 'react';

import type { UnionSection } from '../../lib/union-settings-groups';
import { isAgentId } from '../agents/agent-labels';
import { AgentPage } from '../agents/agent-page';
import { ConnectorList } from '../agents/connector-list';
import { ToolList } from '../agents/tool-list';
import { GitHubAppSection } from '../github-app/github-app-section';
import { ModelsPage } from './models-page';

const OTHER_PAGES: Record<Exclude<UnionSection, AgentId>, () => ReactElement> = {
  models: () => <ModelsPage />,
  tools: () => <ToolList />,
  connectors: () => <ConnectorList />,
  'github-app': () => <GitHubAppSection />,
};

/** The open Union settings page: an agent's, or the models', tools', connectors' or GitHub App's. */
export function UnionSectionBody({ section }: { section: UnionSection }): ReactElement {
  return isAgentId(section) || isCustomStep(section) ? (
    <AgentPage agent={section} />
  ) : (
    OTHER_PAGES[section]()
  );
}
