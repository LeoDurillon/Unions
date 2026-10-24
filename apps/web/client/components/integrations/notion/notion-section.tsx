// The project settings section for the Notion connection, verified when saved.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import type { PublicProject } from '../../../../src/api-types';
import { integrationsApi, projectIntegration } from '../../../lib/integrations-api';
import { useSettingsForm } from '../../../lib/use-settings-form';
import { TokenInput } from '../../onboarding/connect-step';
import { SaveBar } from '../../settings/save-bar';
import { Badge, Button, ErrorText, Field, inputClass } from '../../ui';
import { NotionHelp } from './notion-step';

/** Notion is read with them before they are saved, so a typo never replaces a working connection. */
async function connect(project: PublicProject, token: string, dataSource: string): Promise<string> {
  const saved = await integrationsApi.save(project.id, 'notion', {
    ...(token === '' ? {} : { secret: token }),
    config: { dataSourceId: dataSource },
  });
  return saved.title || 'Untitled data source';
}

/** Applies at once: the integration secret is dropped and imports stop. */
function Disconnect({ project }: { project: PublicProject }): ReactElement | null {
  const queryClient = useQueryClient();
  const disconnect = useMutation({
    mutationFn: () => integrationsApi.remove(project.id, 'notion'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });
  if (!projectIntegration(project, 'notion')) {
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

/** A connected project keeps its stored secret when none is pasted. */
function invalidReason(connected: boolean, token: string, dataSource: string): string | null {
  if (!connected && token.trim() === '') {
    return 'Paste the integration secret to verify the connection.';
  }
  return dataSource.trim() === '' ? 'Give the data source.' : null;
}

function dataSourceOf(project: PublicProject): string {
  const dataSourceId = projectIntegration(project, 'notion')?.config.dataSourceId;
  return typeof dataSourceId === 'string' ? dataSourceId : '';
}

export function NotionSection({ project }: { project: PublicProject }): ReactElement {
  const connected = projectIntegration(project, 'notion') !== null;
  const form = useSettingsForm(
    () => ({ token: '', dataSource: dataSourceOf(project) }),
    ({ token, dataSource }) => connect(project, token.trim(), dataSource.trim()),
  );
  const { token, dataSource } = form.value;

  return (
    <section className="space-y-4">
      <p className="flex items-center gap-2 text-sm">
        Notion import
        <Badge tone={connected ? 'green' : 'neutral'}>
          {connected ? 'connected' : 'not connected'}
        </Badge>
      </p>
      <NotionHelp />
      <Field
        label="Integration secret"
        hint={connected ? 'Leave empty to keep the stored one, or paste a new secret.' : undefined}
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
      <SaveBar
        state={form}
        label="Verify and save"
        invalid={invalidReason(connected, token, dataSource)}
      >
        <Disconnect project={project} />
      </SaveBar>
    </section>
  );
}
