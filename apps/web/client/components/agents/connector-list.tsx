// The claude.ai connectors the agents can use (Figma…), read from the Claude account the worker
// runs agents with.

import type { ReactElement } from 'react';

import type { ConnectorsResponse } from '../../../src/api-types';
import { formatWhen } from '../../lib/ui/relative-time';
import { useConnectors } from '../../lib/union-settings/use-connectors';
import { SettingsIntro } from '../settings/settings-intro';
import { Badge, Button, ErrorText } from '../ui/ui';

function CheckStatus({
  check,
  checking,
}: {
  check: ConnectorsResponse['check'];
  checking: boolean;
}): ReactElement | null {
  if (checking) {
    return (
      <p className="text-xs text-zinc-500">Reading the connectors in a fresh agent container…</p>
    );
  }
  if (check?.status === 'failed') {
    return (
      <p className="text-xs text-red-600 dark:text-red-400">The last check failed: {check.error}</p>
    );
  }
  if (check?.finishedAt) {
    return <p className="text-xs text-zinc-500">Checked {formatWhen(check.finishedAt)}.</p>;
  }
  return null;
}

/**
 * The claude.ai connectors the agents can use (Figma…), read from the Claude account the worker runs
 * agents with. Each becomes one tool to select on an agent; the connector's sign-in stays with
 * claude.ai, nothing is copied into the containers.
 */
export function ConnectorList(): ReactElement {
  const { connectors, check, checking } = useConnectors();
  const list = connectors.data?.connectors ?? [];
  return (
    <>
      <SettingsIntro>
        The MCP connectors of your Claude account (claude.ai → Settings → Connectors). Select one on
        an agent like a tool to give it all the connector&apos;s tools; agents without one selected
        do not load any.
      </SettingsIntro>
      <section className="space-y-3">
        <header className="flex items-start justify-between gap-3">
          <div className="space-y-0.5">
            <h3 className="font-semibold">Your connectors</h3>
            <CheckStatus check={connectors.data?.check ?? null} checking={checking} />
          </div>
          <Button
            disabled={checking}
            onClick={() => {
              check.mutate();
            }}
          >
            {list.length === 0 ? 'Read connectors' : 'Check again'}
          </Button>
        </header>
        <ErrorText error={connectors.error ?? check.error} />
        {list.length === 0 ? (
          <p className="text-sm text-zinc-500">No connector read yet.</p>
        ) : (
          <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
            {list.map((connector) => (
              <li key={connector.name} className="flex items-center gap-3 px-3 py-2">
                <span className="font-medium">{connector.name}</span>
                <code className="min-w-0 flex-1 truncate text-xs text-zinc-500">
                  {connector.tool}
                </code>
                <Badge tone={connector.connected ? 'green' : 'amber'} title={connector.url}>
                  {connector.status.replace(/^✔\s*/u, '')}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
