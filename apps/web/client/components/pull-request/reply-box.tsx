// The box a reply to a pull request comment is written in: its text, Resolve for a thread, who posts, the error with the text kept.
import { useState, type ReactElement } from 'react';

import { Button, inputClass } from '../ui';

const ROWS = 4;

/** What the box says and does; `onSend` rejects with GitHub's or the server's reason. */
export type ReplyBoxProps = {
  initial: string;
  /** Threads only: resolving needs a thread. */
  resolvable: boolean;
  initialResolve?: boolean;
  postsAs: string;
  canPost: boolean;
  /** A failure the box opened with (a reply GitHub refused). */
  error?: string | null;
  sendLabel?: string;
  onSend: (body: string, resolve: boolean) => Promise<void>;
  onCancel: () => void;
};

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The text, Resolve the thread, then Send and Cancel; the text stays when sending fails. */
export function ReplyBox(props: ReplyBoxProps): ReactElement {
  const { resolvable, postsAs, canPost, sendLabel = 'Send', onSend, onCancel } = props;
  const [body, setBody] = useState(props.initial);
  const [resolve, setResolve] = useState(props.initialResolve ?? false);
  const [problem, setProblem] = useState<string | null>(props.error ?? null);
  const [sending, setSending] = useState(false);
  const send = async (): Promise<void> => {
    setSending(true);
    setProblem(null);
    try {
      await onSend(body, resolvable && resolve);
    } catch (error) {
      setProblem(errorText(error));
    } finally {
      setSending(false);
    }
  };
  return (
    <div className="space-y-2 rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
      <textarea
        aria-label="Reply"
        className={`${inputClass} font-mono text-xs`}
        rows={ROWS}
        value={body}
        onChange={(event) => {
          setBody(event.target.value);
        }}
      />
      {resolvable ? (
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={resolve}
            onChange={(event) => {
              setResolve(event.target.checked);
            }}
          />
          Resolve the thread
        </label>
      ) : null}
      {problem ? <p className="text-xs text-red-600 dark:text-red-400">{problem}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          disabled={sending || !canPost || body.trim() === ''}
          onClick={() => {
            void send();
          }}
        >
          {sendLabel}
        </Button>
        <Button variant="ghost" disabled={sending} onClick={onCancel}>
          Cancel
        </Button>
        <span className="ml-auto text-xs text-zinc-500">{postsAs}</span>
      </div>
    </div>
  );
}
