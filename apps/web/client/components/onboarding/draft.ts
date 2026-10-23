// The setup wizard's draft: what it collects, its steps, and when the user may move on.
import type { ProjectOption, RepoOption, Viewer } from '../../../src/api-types';
import type { GitHubCredential } from '../../lib/api';
import type { AccessMethod } from '../github-app/access-method';

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
  /** Optional: both empty skips Notion; otherwise `notionTitle` is set once verified. */
  notionToken: string;
  notionDataSourceId: string;
  notionTitle: string | null;
};

export const EMPTY_DRAFT: Draft = {
  method: 'token',
  token: '',
  installationId: null,
  viewer: null,
  repo: null,
  project: null,
  baseBranch: 'main',
  notionToken: '',
  notionDataSourceId: '',
  notionTitle: null,
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
    label: 'Project',
    title: 'GitHub Project',
    description: 'Tickets are mirrored to a GitHub Project board.',
  },
  {
    label: 'Notion',
    title: 'Notion (optional)',
    description: 'Import tickets from a Notion data source. Leave both fields empty to skip.',
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

function projectChosen({ project }: Draft): boolean {
  return project?.kind === 'existing' || (project?.kind === 'new' && project.title.trim() !== '');
}

function notionSettled(draft: Draft): boolean {
  const skipped = draft.notionToken.trim() === '' && draft.notionDataSourceId.trim() === '';
  return skipped || draft.notionTitle !== null;
}

/** What each step needs before Next (or Create) is enabled. */
const READY: Record<StepLabel, (draft: Draft) => boolean> = {
  Connect: (draft) => draft.viewer !== null && draft.viewer.missingScopes.length === 0,
  Repository: (draft) => draft.repo !== null,
  Project: projectChosen,
  Notion: notionSettled,
  Review: (draft) => draft.baseBranch.trim() !== '',
};

/** Whether the user may leave `step` (index) with the current draft. */
export function canContinue(step: number, draft: Draft): boolean {
  const label = STEPS[step]?.label;
  return label ? READY[label](draft) : false;
}
