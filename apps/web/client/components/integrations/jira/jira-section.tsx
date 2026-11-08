// The project settings section for the Jira connection, verified when saved.

import type { ReactElement } from 'react';

import type { PublicProject } from '../../../../src/api-types';
import { integrationsApi, projectIntegration } from '../../../lib/integrations-api';
import { useJiraRuleSource } from '../../../lib/integrations/jira-rule-source';
import { useSettingsForm } from '../../../lib/use-settings-form';
import { SaveBar } from '../../settings/save-bar';
import { Badge } from '../../ui';
import { Disconnect } from '../disconnect';
import { JiraFields, JiraHelp, jiraConfigOf, jiraFormOf, type JiraForm } from './jira-fields';
import { JiraIssueTypeField } from './jira-issue-type-field';

/** Jira is read with them before they are saved, so a typo never replaces a working connection. */
async function connect(project: PublicProject, form: JiraForm): Promise<JiraForm> {
  const token = form.token.trim();
  const saved = await integrationsApi.save(project.id, 'jira', {
    ...(token === '' ? {} : { secret: token }),
    config: jiraConfigOf(form),
  });
  return jiraFormOf(saved.config);
}

/** A connected project keeps its stored token when none is pasted. */
function invalidReason(connected: boolean, form: JiraForm): string | null {
  if (!connected && form.token.trim() === '') {
    return 'Paste the API token to verify the connection.';
  }
  const { site, email, projectKey } = jiraConfigOf(form);
  return site === '' || email === '' || projectKey === ''
    ? 'Give the site, the account email and the project key.'
    : null;
}

export function JiraSection({ project }: { project: PublicProject }): ReactElement {
  const integration = projectIntegration(project, 'jira');
  const connected = integration !== null;
  const source = useJiraRuleSource(project.id);
  const form = useSettingsForm(
    () => jiraFormOf(integration?.config),
    (value) => connect(project, value),
  );

  return (
    <section className="space-y-4">
      <p className="flex items-center gap-2 text-sm">
        Jira import
        <Badge tone={connected ? 'green' : 'neutral'}>
          {connected ? 'connected' : 'not connected'}
        </Badge>
        {integration?.title ? (
          <span className="text-zinc-500">project “{integration.title}”</span>
        ) : null}
      </p>
      <JiraHelp />
      <JiraFields
        value={form.value}
        tokenHint={
          connected ? 'Leave empty to keep the stored one, or paste a new token.' : undefined
        }
        onChange={(value) => {
          form.set(value);
        }}
      />
      <JiraIssueTypeField
        types={source?.issueTypes ?? null}
        value={form.value.issueTypeId}
        onChange={(issueTypeId) => {
          form.set({ ...form.value, issueTypeId });
        }}
      />
      <SaveBar state={form} label="Verify and save" invalid={invalidReason(connected, form.value)}>
        <Disconnect project={project} kind="jira" />
      </SaveBar>
    </section>
  );
}
