// The outside services the API routes may call: GitHub (the wizard's and the PR tab's reads, its CI), Notion.
import type { NotionApi } from '@union/core';

import type { CiGitHub } from './github-checks';
import type { OnboardingGitHub } from './github-onboarding';

export type ApiServices = { github: OnboardingGitHub; notion: NotionApi; ci: CiGitHub };
