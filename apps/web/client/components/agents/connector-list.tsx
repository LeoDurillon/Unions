import type { ReactElement } from 'react';

import type { ConnectorsResponse } from '../../../src/api-types';
import { useConnectors } from '../../lib/use-connectors';
import { Button, ErrorText } from '../ui';

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
    return <p className="text-xs text-red-600">The last check failed: {check.error}</p>;
  }
  if (check?.finishedAt) {
    return (
      <p className="text-xs text-zinc-500">
        Checked {new Date(check.finishedAt).toLocaleString()}.
      </p>
    );
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
    <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Connectors</h3>
          <p className="text-xs text-zinc-500">
            The MCP connectors of your Claude account (claude.ai → Settings → Connectors). Select
            one on an agent like a tool to give it all the connector&apos;s tools; agents without
            one selected do not load any.
          </p>
        </div>
        <div className="shrink-0">
          <Button
            disabled={checking}
            onClick={() => {
              check.mutate();
            }}
          >
            {list.length === 0 ? 'Read connectors' : 'Check again'}
          </Button>
        </div>
      </header>
      <ErrorText error={connectors.error ?? check.error} />
      <CheckStatus check={connectors.data?.check ?? null} checking={checking} />
      {list.length === 0 ? (
        <p className="text-sm text-zinc-500">No connector read yet.</p>
      ) : (
        <ul className="divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
          {list.map((connector) => (
            <li key={connector.name} className="flex items-center gap-3 py-2">
              <span className="font-medium">{connector.name}</span>
              <code className="min-w-0 flex-1 truncate text-xs text-zinc-500">
                {connector.tool}
              </code>
              <span
                className={`text-xs ${connector.connected ? 'text-green-700 dark:text-green-400' : 'text-amber-700 dark:text-amber-400'}`}
                title={connector.url}
              >
                {connector.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
