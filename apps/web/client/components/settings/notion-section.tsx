// The project settings section for the Notion connection, verified when saved.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { api } from '../../lib/api';
import { eventRulesApi } from '../../lib/event-rules-api';
import { useSettingsForm } from '../../lib/use-settings-form';
import { TokenInput } from '../onboarding/connect-step';
import { NotionHelp } from '../onboarding/notion-step';
import { Badge, Button, ErrorText, Field, inputClass } from '../ui';
import { SaveBar } from './save-bar';

/** Verifies before saving, so a typo never replaces a working connection. */
async function connect(project: PublicProject, token: string, dataSource: string): Promise<string> {
  const verified = await api.notion.verify(token, dataSource);
  await api.updateProject(project.id, {
    notionToken: token,
    notionDataSourceId: verified.dataSourceId,
  });
  // The event rules pick among the data source's columns.
  await eventRulesApi.refreshNotion(project.id);
  return verified.title || 'Untitled data source';
}

/** Applies at once: the integration secret is dropped and imports stop. */
function Disconnect({ project }: { project: PublicProject }): ReactElement | null {
  const queryClient = useQueryClient();
  const disconnect = useMutation({
    mutationFn: () => api.updateProject(project.id, { notionToken: '', notionDataSourceId: '' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });
  if (!project.hasNotion) {
    return null;
  }
  return (
    <>
      <ErrorText error={disconnect.error} />
      <Button
        disabled={disconnect.isPending}
        onClick={() => {
          disconnect.mutate();
        }}
      >
        Disconnect
      </Button>
    </>
  );
}

function invalidReason(token: string, dataSource: string): string | null {
  if (token.trim() === '') {
    return 'Paste the integration secret to verify the connection.';
  }
  return dataSource.trim() === '' ? 'Give the data source.' : null;
}

export function NotionSection({ project }: { project: PublicProject }): ReactElement {
  const form = useSettingsForm(
    () => ({ token: '', dataSource: project.config.notionDataSourceId ?? '' }),
    ({ token, dataSource }) => connect(project, token.trim(), dataSource.trim()),
  );
  const { token, dataSource } = form.value;

  return (
    <section className="space-y-4">
      <p className="flex items-center gap-2 text-sm">
        Notion import
        <Badge tone={project.hasNotion ? 'green' : 'neutral'}>
          {project.hasNotion ? 'connected' : 'not connected'}
        </Badge>
      </p>
      <NotionHelp />
      <Field
        label="Integration secret"
        hint={project.hasNotion ? 'Paste a new secret to replace the stored one.' : undefined}
      >
        <TokenInput
          value={token}
          onChange={(value) => {
            form.set({ ...form.value, token: value });
          }}
          placeholder="ntn_…"
        />
      </Field>
      <Field label="Data source ID or URL">
        <input
          className={`${inputClass} font-mono`}
          value={dataSource}
          onChange={(event) => {
            form.set({ ...form.value, dataSource: event.target.value });
          }}
        />
      </Field>
      <SaveBar state={form} label="Verify and save" invalid={invalidReason(token, dataSource)}>
        <Disconnect project={project} />
      </SaveBar>
    </section>
  );
}
