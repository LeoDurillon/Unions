// The setup wizard's draft: what it collects, its steps, and when the user may move on.
import { isIntegrationKindName, type IntegrationKindName } from '@union/core/integration-kinds';
import { SETUP_DEFAULT_MODEL } from '@union/core/investigation-defaults';
import type { AgentModel } from '@union/core/states';

import type { ProjectOption, RepoOption, Viewer } from '../../../src/api-types';
import type { GitHubCredential } from '../../lib/api';
import { blockingScopes as blocking } from '../../lib/github-project-api';
import type { NewIntegration } from '../../lib/integrations-api';
import type { AccessMethod } from '../github-app/access-method';

/** A tracker in the wizard: optional; all empty skips it, otherwise `title` is set once verified. */
export type TrackerDraft = { secret: string; config: Record<string, string>; title: string | null };

/** Null: no GitHub Project, Union's board is the only one. */
export type ProjectChoice =
  | { kind: 'existing'; project: ProjectOption }
  | { kind: 'new'; title: string }
  | null;

/** Everything the wizard collects; nothing is saved until the last step. */
export type Draft = {
  method: AccessMethod;
  token: string;
  /** With `method: 'app'`: the chosen installation of the GitHub App. */
  installationId: number | null;
  viewer: Viewer | null;
  repo: RepoOption | null;
  project: ProjectChoice;
  baseBranch: string;
  /** The trackers to import tickets from, each optional. */
  trackers: Record<IntegrationKindName, TrackerDraft>;
  /** Run the setup agent once the project exists (uses the Claude subscription: off unless ticked). */
  setupAgent: boolean;
  setupModel: AgentModel;
};

export const EMPTY_DRAFT: Draft = {
  method: 'token',
  token: '',
  installationId: null,
  viewer: null,
  repo: null,
  project: null,
  baseBranch: 'main',
  trackers: {
    notion: { secret: '', config: { dataSourceId: '' }, title: null },
    jira: { secret: '', config: { site: '', email: '', projectKey: '' }, title: null },
  },
  setupAgent: false,
  setupModel: SETUP_DEFAULT_MODEL,
};

export const STEPS = [
  {
    label: 'Connect',
    title: 'Connect GitHub',
    description: 'Use a personal access token or a GitHub App. Credentials stay on this machine.',
  },
  {
    label: 'Repository',
    title: 'Pick a repository',
    description: 'The agent works on a clone of this repository.',
  },
  {
    label: 'Integrations',
    title: 'Integrations (optional)',
    description:
      'Show the tickets on a GitHub Project board, or import them from Notion or Jira. Pick one to set it up; each can be skipped.',
  },
  {
    label: 'Review',
    title: 'Ready to go',
    description: 'Check the summary, then create the project.',
  },
] as const;

/** What the wizard's GitHub calls and the new project use. */
export function credentialOf(draft: Draft): GitHubCredential {
  return draft.method === 'app' && draft.installationId !== null
    ? { installationId: draft.installationId }
    : { token: draft.token.trim() };
}

export type StepProps = {
  draft: Draft;
  patch: (change: Partial<Draft>) => void;
};

type StepLabel = (typeof STEPS)[number]['label'];

/** Needed only for a GitHub Project: a token without it still sets up a project with none. */
const PROJECT_SCOPE = 'project';

/** The missing scopes that stop the setup: all but `project`, which only a GitHub Project needs. */
function blockingScopes(draft: Draft): string[] {
  return blocking(draft.viewer?.missingScopes ?? [], false);
}

/** A GitHub Project is picked but the token cannot reach Projects. */
export function projectScopeMissing(draft: Draft): boolean {
  return draft.project !== null && (draft.viewer?.missingScopes ?? []).includes(PROJECT_SCOPE);
}

/** No GitHub Project, one picked, or a new one with a title; and the token can reach it. */
export function projectSettled(draft: Draft): boolean {
  const { project } = draft;
  if (project?.kind === 'new' && project.title.trim() === '') {
    return false;
  }
  return !projectScopeMissing(draft);
}

/** Whether the tracker is left empty (skipped). */
export function trackerSkipped({ secret, config }: TrackerDraft): boolean {
  return [secret, ...Object.values(config)].every((value) => value.trim() === '');
}

export function trackerSettled(draft: Draft, kind: IntegrationKindName): boolean {
  const tracker = draft.trackers[kind];
  return trackerSkipped(tracker) || tracker.title !== null;
}

/** The trackers the wizard offers, in its order. */
export function trackerKinds(draft: Draft): IntegrationKindName[] {
  return Object.keys(draft.trackers).filter((kind) => isIntegrationKindName(kind));
}

/** The trackers verified in the wizard, as the new project takes them. */
export function verifiedTrackers(draft: Draft): NewIntegration[] {
  return trackerKinds(draft).flatMap((kind) => {
    const { secret, config, title } = draft.trackers[kind];
    const trimmed = Object.fromEntries(
      Object.entries(config).map(([name, value]) => [name, value.trim()]),
    );
    return title === null ? [] : [{ kind, secret: secret.trim(), config: trimmed }];
  });
}

/** What each step needs before Next (or Create) is enabled. */
const READY: Record<StepLabel, (draft: Draft) => boolean> = {
  Connect: (draft) => draft.viewer !== null && blockingScopes(draft).length === 0,
  Repository: (draft) => draft.repo !== null,
  Integrations: (draft) =>
    projectSettled(draft) && trackerKinds(draft).every((kind) => trackerSettled(draft, kind)),
  Review: (draft) => draft.baseBranch.trim() !== '',
};

/** Whether the user may leave `step` (index) with the current draft. */
export function canContinue(step: number, draft: Draft): boolean {
  const label = STEPS[step]?.label;
  return label ? READY[label](draft) : false;
}
