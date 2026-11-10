// The part of the user guide each settings page links to with Learn more: a guide page and a heading of it.

import type { SettingsSection } from '../settings-sections';
import type { UnionSection } from '../union-settings-groups';

/** A page of `documentation/` (without `.md`) and the id of one of its headings. */
export type GuideTarget = readonly [page: string, anchor: string];

/** Where each project settings page's Learn more goes; the type makes every page have one. */
export const PROJECT_GUIDE: Record<SettingsSection, GuideTarget> = {
  general: ['first-project', 'connect-github'],
  files: ['previews', 'project-files'],
  instructions: ['agents', 'project-instructions'],
  memory: ['agents', 'memory'],
  checks: ['first-project', 'tell-the-agents-how-to-build-and-check-your-code'],
  size: ['ticket-lifecycle', 'the-size-of-a-change'],
  scripts: ['previews', 'commands-and-scripts'],
  flows: ['tickets', 'flows'],
  'agent-image': ['agents', 'the-agent-image'],
  'pull-requests': ['branches', 'the-pull-request'],
  review: ['reviewing', 'review-a-tickets-branch'],
  'preview-services': ['previews', 'set-it-up'],
  'preview-variables': ['previews', 'set-it-up'],
  'preview-e2e': ['previews', 'end-to-end-tests'],
  'preview-limits': ['previews', 'run-a-preview'],
  'github-project': ['settings', 'github-issues-and-the-github-project'],
  notion: ['first-project', 'the-setup-wizard'],
  jira: ['first-project', 'connect-jira'],
  'event-rules': ['automation', 'event-rules'],
  'event-activity': ['automation', 'event-rules'],
  danger: ['settings', 'project-settings'],
};

/** The Union settings pages that are not an agent's. */
const UNION_PAGE_GUIDE: Partial<Record<string, GuideTarget>> = {
  resources: ['settings', 'resources'],
  tools: ['agents', 'tools-and-connectors'],
  connectors: ['agents', 'tools-and-connectors'],
  'github-app': ['first-project', 'use-a-github-app'],
  lesson_writer: ['agents', 'memory'],
  lesson_tidier: ['agents', 'memory'],
};

const CUSTOM_AGENT = /^agent_\d+$/u;

/** Where a Union settings page's Learn more goes: an agent's page goes to the agents' table. */
export function unionSettingsGuide(section: UnionSection): GuideTarget {
  if (CUSTOM_AGENT.test(section)) {
    return ['agents', 'custom-agents'];
  }
  return UNION_PAGE_GUIDE[section] ?? ['agents', 'the-agents'];
}
