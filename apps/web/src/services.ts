// The outside services the API routes may call: GitHub (the wizard's and the PR tab's reads, its CI, the
// Repository tab's reads), Notion.
import type { NotionApi } from '@union/core';

import type { CiGitHub } from './github-checks';
import type { OnboardingGitHub } from './github-onboarding';
import type { RepositoryGitHub } from './github-repository';

export type ApiServices = {
  github: OnboardingGitHub;
  notion: NotionApi;
  ci: CiGitHub;
  repository: RepositoryGitHub;
};
