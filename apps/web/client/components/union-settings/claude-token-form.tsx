// Pasting the token `claude setup-token` printed; the server checks its shape and keeps it.

import type { UseMutationResult } from '@tanstack/react-query';
import type { ClaudeTokenStatus } from '@union/core';
import { useState, type ReactElement } from 'react';

import { Button, ErrorText, Field, inputClass } from '../ui/ui';

/** How to make a token: a terminal on any machine logged in to the same Claude account. */
function SetupTokenHelp(): ReactElement {
  return (
    <ol className="list-decimal space-y-1 pl-5 text-xs text-zinc-500">
      <li>
        In a terminal, run <code>claude setup-token</code> and sign in with the Claude account the
        agents use.
      </li>
      <li>
        Copy the token it prints (it starts with <code>sk-ant-oat01-</code>) and paste it below.
      </li>
    </ol>
  );
}

/** Pasting the token `claude setup-token` printed; the field is emptied once it is saved. */
export function ClaudeTokenForm({
  save,
  onSaved,
}: {
  save: UseMutationResult<ClaudeTokenStatus, Error, string>;
  onSaved?: () => void;
}): ReactElement {
  const [token, setToken] = useState('');
  const ready = token.trim() !== '' && !save.isPending;
  return (
    <div className="space-y-3">
      <SetupTokenHelp />
      <Field label="Token" hint="Stays on this machine; never sent back to the browser.">
        <input
          className={`${inputClass} font-mono`}
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="sk-ant-oat01-…"
          value={token}
          onChange={(event) => {
            setToken(event.target.value);
          }}
        />
      </Field>
      <ErrorText error={save.error} />
      <Button
        variant="primary"
        disabled={!ready}
        onClick={() => {
          save.mutate(token.trim(), {
            onSuccess: () => {
              setToken('');
              onSaved?.();
            },
          });
        }}
      >
        {save.isPending ? 'Saving…' : 'Save the token'}
      </Button>
    </div>
  );
}
