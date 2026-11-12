// The outside services the API routes may call: GitHub and Notion. GitHub serves the wizard's and
// the PR tab's reads, its CI, the Repository tab's reads.
import type { JiraApi, NotionApi } from '@union/core';

import type { CiGitHub } from './github-checks';
import type { OnboardingGitHub } from './github-onboarding';
import type { RepositoryGitHub } from './github-repository';

export type ApiServices = {
  github: OnboardingGitHub;
  notion: NotionApi;
  jira: JiraApi;
  ci: CiGitHub;
  repository: RepositoryGitHub;
};
