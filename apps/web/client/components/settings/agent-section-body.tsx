// The Agents group of the project settings: instructions, memory, checks, change size, scripts, flows and the agent image.
import type { ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { AgentImageSection } from './agent-image-section';
import { ChecksSection } from './checks-section';
import { FlowsSection } from './flows-section';
import { InstructionsSection } from './instructions-section';
import { MemorySection } from './memory-section';
import { ScriptsSection } from './scripts-section';
import { SizeSection } from './size-section';

export const AGENT_SECTIONS = [
  'instructions',
  'memory',
  'checks',
  'size',
  'scripts',
  'flows',
  'agent-image',
] as const;
export type AgentSection = (typeof AGENT_SECTIONS)[number];

/** What the agents are told and have learned, how their work is checked, the commands and the steps they run, and the image they run in. */
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
    size: () => <SizeSection project={project} />,
    scripts: () => <ScriptsSection project={project} />,
    flows: () => <FlowsSection project={project} />,
    'agent-image': () => <AgentImageSection project={project} />,
  };
  return bodies[section]();
}
