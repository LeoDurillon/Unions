// The Agents group of the project settings: instructions, memory, checks, scripts and flows.
import type { ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { ChecksSection } from './checks-section';
import { FlowsSection } from './flows-section';
import { InstructionsSection } from './instructions-section';
import { MemorySection } from './memory-section';
import { ScriptsSection } from './scripts-section';

export const AGENT_SECTIONS = ['instructions', 'memory', 'checks', 'scripts', 'flows'] as const;
export type AgentSection = (typeof AGENT_SECTIONS)[number];

/** What the agents are told and have learned, how their work is checked, the commands and the steps they run. */
export function AgentSectionBody({
  section,
  project,
}: {
  section: AgentSection;
  project: PublicProject;
}): ReactElement {
  const bodies: Record<AgentSection, () => ReactElement> = {
    instructions: () => <InstructionsSection project={project} />,
    memory: () => <MemorySection project={project} />,
    checks: () => <ChecksSection project={project} />,
    scripts: () => <ScriptsSection project={project} />,
    flows: () => <FlowsSection project={project} />,
  };
  return bodies[section]();
}
