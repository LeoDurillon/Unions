// The open Union settings page: an agent's, or another (all agents, resources, tools, connectors,
// the GitHub App).

import { isCustomStep } from '@union/core/states';
import type { ReactElement } from 'react';

import type { UnionSection } from '../../lib/union-settings/union-settings-groups';
import { isAgentId } from '../agents/agent-labels';
import { AgentPage } from '../agents/agent-page';
import { OTHER_PAGES } from './union-other-pages';

/** The open Union settings page: an agent's, or one of the others. */
export function UnionSectionBody({ section }: { section: UnionSection }): ReactElement {
  return isAgentId(section) || isCustomStep(section) ? (
    <AgentPage agent={section} />
  ) : (
    OTHER_PAGES[section]()
  );
}
