// Project settings → General: how Union reaches the repository, the base branch, GitHub issues and the setup agent.
import type { ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { BranchSection } from './branch-section';
import { GitHubAccessSection } from './github-access-section';
import { IssuesSection } from './issues-section';
import { SettingsIntro } from './settings-intro';
import { SetupAgentSection } from './setup-agent-section';

/** Each part is a card (`.settings-cards`): its Save bar shows inside it once it holds something to save. */
export function GeneralSection({ project }: { project: PublicProject }): ReactElement {
  return (
    <>
      <SettingsIntro>
        How Union reaches the repository, the branch new tickets start from, its GitHub issues, and
        the setup agent.
      </SettingsIntro>
      <GitHubAccessSection project={project} />
      <BranchSection project={project} />
      <IssuesSection project={project} />
      <SetupAgentSection project={project} />
    </>
  );
}
