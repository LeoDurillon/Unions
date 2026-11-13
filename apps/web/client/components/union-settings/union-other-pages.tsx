// The Union settings pages that are not an agent's: All agents, Resources, System, Tools, Connectors and the GitHub App.

import type { AgentId } from '@union/core';
import type { ReactElement } from 'react';

import type { UnionSection } from '../../lib/union-settings/union-settings-groups';
import { ConnectorList } from '../agents/connector-list';
import { ToolList } from '../agents/tool-list';
import { GitHubAppSection } from '../github-app/github-app-section';
import { ModelsPage } from './models-page';
import { ResourcesPage } from './resources-page';
import { SystemPage } from './system-page';

export const OTHER_PAGES: Record<Exclude<UnionSection, AgentId>, () => ReactElement> = {
  models: () => <ModelsPage />,
  resources: () => <ResourcesPage />,
  system: () => <SystemPage />,
  tools: () => <ToolList />,
  connectors: () => <ConnectorList />,
  'github-app': () => <GitHubAppSection />,
};
