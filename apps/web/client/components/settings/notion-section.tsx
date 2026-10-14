import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { api } from '../../lib/api';
import { eventRulesApi } from '../../lib/event-rules-api';
import { TokenInput } from '../onboarding/connect-step';
import { NotionHelp } from '../onboarding/notion-step';
import { Badge, Button, ErrorText, Field, inputClass } from '../ui';

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

function NotionActions({
  canSave,
  saving,
  connected,
  disconnecting,
  onSave,
  onDisconnect,
}: {
  canSave: boolean;
  saving: boolean;
  connected: boolean;
  disconnecting: boolean;
  onSave: () => void;
  onDisconnect: () => void;
}): ReactElement {
  return (
    <div className="flex gap-2">
      <Button variant="primary" disabled={!canSave} onClick={onSave}>
        {saving ? 'Verifying…' : 'Verify and save'}
      </Button>
      {connected ? (
        <Button disabled={disconnecting} onClick={onDisconnect}>
          Disconnect
        </Button>
      ) : null}
    </div>
  );
}

export function NotionSection({ project }: { project: PublicProject }): ReactElement {
  const queryClient = useQueryClient();
  const [token, setToken] = useState('');
  const [dataSource, setDataSource] = useState(project.config.notionDataSourceId ?? '');
  const refresh = (): Promise<void> => queryClient.invalidateQueries({ queryKey: ['projects'] });
  const save = useMutation({
    mutationFn: () => connect(project, token.trim(), dataSource.trim()),
    onSuccess: refresh,
  });
  const disconnect = useMutation({
    mutationFn: () => api.updateProject(project.id, { notionToken: '', notionDataSourceId: '' }),
    onSuccess: refresh,
  });

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
        <TokenInput value={token} onChange={setToken} placeholder="ntn_…" />
      </Field>
      <Field label="Data source ID or URL">
        <input
          className={`${inputClass} font-mono`}
          value={dataSource}
          onChange={(event) => {
            setDataSource(event.target.value);
          }}
        />
      </Field>
      <ErrorText error={save.error ?? disconnect.error} />
      {save.data ? (
        <p className="text-sm text-green-700 dark:text-green-400">Connected to “{save.data}”.</p>
      ) : null}
      <NotionActions
        canSave={token.trim() !== '' && dataSource.trim() !== '' && !save.isPending}
        saving={save.isPending}
        connected={project.hasNotion}
        disconnecting={disconnect.isPending}
        onSave={() => {
          save.mutate();
        }}
        onDisconnect={() => {
          disconnect.mutate();
        }}
      />
    </section>
  );
}
