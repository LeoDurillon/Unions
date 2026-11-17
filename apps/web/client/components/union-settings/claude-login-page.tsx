// Union settings → Claude login: whether the agents run with a long-lived token or a copy of the host's login.

import { useState, type ReactElement } from 'react';

import { formatWhen } from '../../lib/ui/relative-time';
import { useClaudeToken } from '../../lib/union-settings/use-claude-token';
import { SettingsIntro } from '../settings/settings-intro';
import { ConfirmButton } from '../ui/confirm-button';
import { Badge, Button, ErrorText } from '../ui/ui';
import { ClaudeTokenForm } from './claude-token-form';

const CONNECTORS_NOTE =
  'claude.ai connectors (Figma…) do not work with a token: while one is set, agents get none of their tools (Tools → Connectors).';

function TokenSet({ savedAt }: { savedAt: number }): ReactElement {
  const { save, remove } = useClaudeToken();
  const [replacing, setReplacing] = useState(false);
  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 className="font-semibold">Long-lived token</h3>
        <Badge tone="green">in use</Badge>
        <span className="text-xs text-zinc-500">Saved {formatWhen(savedAt)}</span>
      </header>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Agents run with this token. Your login, and its refresh token, are not copied into their
        containers. If Claude refuses the token (revoked or expired), runs fail and say so: make a
        new one and replace it here.
      </p>
      {replacing ? (
        <ClaudeTokenForm
          save={save}
          onSaved={() => {
            setReplacing(false);
          }}
        />
      ) : null}
      <ErrorText error={remove.error} />
      <div className="flex flex-wrap items-center gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <Button
          onClick={() => {
            setReplacing(!replacing);
          }}
        >
          {replacing ? 'Cancel' : 'Replace the token'}
        </Button>
        <ConfirmButton
          label="Remove"
          question="Remove the token? Agents go back to a copy of your Claude login, refresh token included."
          confirmLabel="Remove the token"
          disabled={remove.isPending}
          onConfirm={() => {
            remove.mutate();
          }}
        />
      </div>
      <p className="text-xs text-zinc-500">{CONNECTORS_NOTE}</p>
    </section>
  );
}

function NoToken(): ReactElement {
  const { save } = useClaudeToken();
  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 className="font-semibold">Your Claude login</h3>
        <Badge tone="amber">refresh token included</Badge>
      </header>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Agents get a copy of the Claude login of this machine, refresh token included: an agent
        could read a credential that renews itself, and one container renewing it can log the others
        out. A long-lived token cannot renew itself, and you can revoke it alone.
      </p>
      <ClaudeTokenForm save={save} />
      <p className="text-xs text-zinc-500">{CONNECTORS_NOTE}</p>
    </section>
  );
}

/** Union settings → Claude login: the long-lived token when one is set, else the host's login. */
export function ClaudeLoginPage(): ReactElement {
  const { status } = useClaudeToken();
  return (
    <>
      <SettingsIntro>How the agents log in to Claude to run on your subscription.</SettingsIntro>
      <ErrorText error={status.error} />
      {status.data?.configured === true ? <TokenSet savedAt={status.data.savedAt} /> : null}
      {status.data?.configured === false ? <NoToken /> : null}
    </>
  );
}
