// The onboarding step that connects a Notion data source with its token.
import { useMutation } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import { api } from '../../lib/api';
import { Button, ErrorText, Field, inputClass } from '../ui';
import { TokenInput } from './connect-step';
import type { StepProps } from './draft';

export function NotionHelp(): ReactElement {
  return (
    <ol className="list-decimal space-y-1 pl-5 text-xs text-zinc-500">
      <li>
        Create an internal integration at{' '}
        <a
          className="underline"
          href="https://www.notion.so/profile/integrations"
          target="_blank"
          rel="noreferrer"
        >
          notion.so/profile/integrations
        </a>{' '}
        and copy its secret.
      </li>
      <li>Share the database with the integration: ••• → Connections → add it.</li>
      <li>
        In the database settings, Manage data sources → Copy data source ID (or paste its URL).
      </li>
    </ol>
  );
}

export function NotionStep({ draft, patch }: StepProps): ReactElement {
  const verify = useMutation({
    mutationFn: () => api.notion.verify(draft.notionToken.trim(), draft.notionDataSourceId.trim()),
    onSuccess: (result) => {
      patch({
        notionDataSourceId: result.dataSourceId,
        notionTitle: result.title || 'Untitled data source',
      });
    },
  });
  const change = (fields: Partial<StepProps['draft']>): void => {
    patch({ ...fields, notionTitle: null });
    verify.reset();
  };
  return (
    <div className="space-y-4">
      <NotionHelp />
      <Field label="Integration secret">
        <TokenInput
          placeholder="ntn_…"
          value={draft.notionToken}
          onChange={(notionToken) => {
            change({ notionToken });
          }}
        />
      </Field>
      <Field label="Data source ID or URL">
        <input
          className={`${inputClass} font-mono`}
          value={draft.notionDataSourceId}
          onChange={(event) => {
            change({ notionDataSourceId: event.target.value });
          }}
        />
      </Field>
      <Button
        variant="primary"
        disabled={
          draft.notionToken.trim() === '' ||
          draft.notionDataSourceId.trim() === '' ||
          verify.isPending
        }
        onClick={() => {
          verify.mutate();
        }}
      >
        {verify.isPending ? 'Verifying…' : 'Verify'}
      </Button>
      <ErrorText error={verify.error} />
      {draft.notionTitle ? (
        <p className="text-sm text-green-700 dark:text-green-400">
          Connected to “{draft.notionTitle}”.
        </p>
      ) : null}
    </div>
  );
}
