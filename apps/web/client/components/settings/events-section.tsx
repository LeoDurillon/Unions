// Event rules: when something happens to a ticket, set a property of its Notion page or comment on
// GitHub. The comment goes on its GitHub issue or pull request.

import { useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import type { EventRulesResponse } from '../../../src/event-api-types';
import { eventRulesApi } from '../../lib/settings/event-rules-api';
import { ErrorText } from '../ui/ui';
import { Rules } from './rules-card';
import { SettingsIntro } from './settings-intro';

function useRules(project: PublicProject): ReturnType<typeof useQuery<EventRulesResponse>> {
  return useQuery({
    queryKey: ['event-rules', project.id],
    queryFn: () => eventRulesApi.list(project.id),
  });
}

/**
 * Event rules: when something happens to a ticket, set a property of its Notion page or comment on
 * its GitHub issue or pull request. They apply from their creation on, never to what happened before.
 */
export function EventRulesSection({ project }: { project: PublicProject }): ReactElement {
  const rules = useRules(project);
  return (
    <>
      <SettingsIntro>
        When something happens to a ticket, set a property of its Notion page (tickets imported from
        Notion) or comment on its GitHub issue or pull request. Rules apply to what happens from
        their creation on.
      </SettingsIntro>
      <ErrorText error={rules.error} />
      <Rules projectId={project.id} data={rules.data} />
    </>
  );
}
