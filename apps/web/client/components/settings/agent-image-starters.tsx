// The agent image page's Dockerfile helpers: "Start from" (the JavaScript, Python, Rust, Go or PHP example) and the default image's Dockerfile, read-only.
import type { ReactElement } from 'react';

import { STARTERS } from '../../lib/agent-image-starters';
import { useDefaultDockerfile } from '../../lib/use-agent-image';
import { Button, ErrorText, inputClass } from '../ui';

/** Replaces the text with a starter; asks first when the text is the user's own (not empty, not a starter). */
export function StarterPicker({
  text,
  onPick,
}: {
  text: string;
  onPick: (dockerfile: string) => void;
}): ReactElement {
  const own = text.trim() !== '' && !STARTERS.some((starter) => starter.dockerfile === text);
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
      <span>Start from:</span>
      {STARTERS.map((starter) => (
        <Button
          key={starter.id}
          size="sm"
          onClick={() => {
            if (!own || globalThis.confirm('Replace your Dockerfile with this example?')) {
              onPick(starter.dockerfile);
            }
          }}
        >
          {starter.label}
        </Button>
      ))}
    </div>
  );
}

/** What the default images are built from (`docker/agent.Dockerfile`), to read: Union's, not the project's. */
export function DefaultDockerfile({ projectId }: { projectId: number }): ReactElement {
  const { data, error } = useDefaultDockerfile(projectId);
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium">Dockerfile of the default image (read-only)</p>
      {data?.dockerfile ? (
        <textarea
          readOnly
          wrap="off"
          aria-label="Dockerfile of the default image"
          className={`${inputClass} min-h-72 cursor-default bg-zinc-50 font-mono text-xs text-zinc-600 dark:bg-zinc-950 dark:text-zinc-400`}
          spellCheck={false}
          value={data.dockerfile}
        />
      ) : (
        <ErrorText error={error} />
      )}
      <p className="text-xs text-zinc-500">
        The agents run on its last stage, union-agent; its first stage is union-agent-base. To add
        to it, choose Dockerfile and start from either.
      </p>
    </div>
  );
}
