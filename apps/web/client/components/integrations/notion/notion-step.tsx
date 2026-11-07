// The setup wizard's Notion form (under Integrations): a data source and its token, and how to get both.
import type { ReactElement } from 'react';

import { TokenInput } from '../../onboarding/connect-step';
import type { StepProps } from '../../onboarding/draft';
import { Field, inputClass } from '../../ui';
import { changeTracker, TrackerVerify } from '../tracker-verify';

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
      <li>
        In its Capabilities, also turn on Read comments and Insert comments, for each ticket&apos;s
        Notion tab.
      </li>
      <li>Share the database with the integration: ••• → Connections → add it.</li>
      <li>
        In the database settings, Manage data sources → Copy data source ID (or paste its URL).
      </li>
    </ol>
  );
}

export function NotionStep(props: StepProps): ReactElement {
  const { secret, config } = props.draft.trackers.notion;
  const dataSourceId = config.dataSourceId ?? '';
  return (
    <div className="space-y-4">
      <NotionHelp />
      <Field label="Integration secret">
        <TokenInput
          placeholder="ntn_…"
          value={secret}
          onChange={(value) => {
            changeTracker(props, 'notion', { secret: value });
          }}
        />
      </Field>
      <Field label="Data source ID or URL">
        <input
          className={`${inputClass} font-mono`}
          value={dataSourceId}
          onChange={(event) => {
            changeTracker(props, 'notion', { config: { dataSourceId: event.target.value } });
          }}
        />
      </Field>
      <TrackerVerify
        kind="notion"
        props={props}
        complete={secret.trim() !== '' && dataSourceId.trim() !== ''}
      />
    </div>
  );
}
