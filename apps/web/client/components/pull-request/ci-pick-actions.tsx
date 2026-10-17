// What to do with the picked checks, jobs and comments: read the text the agent would get, keep it for its next run, or send it now.
import { useState, type ReactElement } from 'react';

import type { CiPick } from '../../../src/ci-api-types';
import type { usePrChecks } from '../../lib/use-pr-checks';
import { SendForm } from '../run-agent-actions';
import { Button, ErrorText } from '../ui';

type Hooks = Pick<ReturnType<typeof usePrChecks>, 'preview' | 'keep' | 'send'>;

/** The text each pick gives the agent, as it will read it. */
function Preview({ preview }: { preview: Hooks['preview'] }): ReactElement | null {
  if (!preview.data) {
    return null;
  }
  return (
    <div className="space-y-2">
      {preview.data.items.map((item) => (
        <details key={`${item.kind}|${item.name}`} open={preview.data.items.length === 1}>
          <summary className="cursor-pointer text-sm">
            {item.name}{' '}
            <span className="text-xs text-zinc-500">({item.text.length} characters)</span>
          </summary>
          <pre className="mt-1 max-h-80 overflow-auto rounded-md bg-zinc-100 p-2 text-xs whitespace-pre-wrap dark:bg-zinc-900">
            {item.text}
          </pre>
        </details>
      ))}
    </div>
  );
}

function PickButtons({
  picks,
  showSend,
  hooks,
  onKept,
  onSendOpen,
}: {
  picks: CiPick[];
  showSend: boolean;
  hooks: Hooks;
  onKept: () => void;
  onSendOpen: () => void;
}): ReactElement {
  const { preview, keep, send } = hooks;
  const none = picks.length === 0;
  const disabled = none || preview.isPending || keep.isPending || send.isPending;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-zinc-500">
        {none ? 'Pick what the agent should read' : `${picks.length} picked`}
      </span>
      <Button
        disabled={disabled}
        onClick={() => {
          preview.mutate(picks);
        }}
      >
        {preview.isPending ? 'Reading GitHub…' : 'Preview'}
      </Button>
      <Button
        disabled={disabled}
        onClick={() => {
          keep.mutate(picks, { onSuccess: onKept });
        }}
      >
        Keep for next run
      </Button>
      {showSend ? (
        <Button disabled={disabled} onClick={onSendOpen}>
          Send to agent…
        </Button>
      ) : null}
    </div>
  );
}

export function CiPickActions({
  picks,
  canSend,
  hooks,
  onDone,
}: {
  picks: CiPick[];
  canSend: boolean;
  hooks: Hooks;
  onDone: () => void;
}): ReactElement {
  const { preview, keep, send } = hooks;
  const [sending, setSending] = useState(false);
  const handleDone = (): void => {
    setSending(false);
    preview.reset();
    onDone();
  };
  return (
    <div className="space-y-2">
      <PickButtons
        picks={picks}
        showSend={canSend && !sending}
        hooks={hooks}
        onKept={handleDone}
        onSendOpen={() => {
          setSending(true);
        }}
      />
      {sending && canSend ? (
        <SendForm
          pending={send.isPending || picks.length === 0}
          onSend={(note) => {
            send.mutate({ picks, note }, { onSuccess: handleDone });
          }}
          onClose={() => {
            setSending(false);
          }}
        />
      ) : null}
      <ErrorText error={preview.error ?? keep.error ?? send.error} />
      <Preview preview={preview} />
    </div>
  );
}
