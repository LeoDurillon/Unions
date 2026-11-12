// The agent image page's Dockerfile fields: the project's (highlighted, with "Start from") and the
// default image's. The default image's is read-only; "Start from" offers the JavaScript, Python,
// Rust, Go or PHP example.
import { useState, type ReactElement } from 'react';

import { STARTERS } from '../../lib/agent-image-starters';
import { useDefaultDockerfile } from '../../lib/use-agent-image';
import { CodeTextarea } from '../code-textarea';
import { Button, ErrorText, Field } from '../ui';

/** Replaces the text with a starter; asks first when the text is the user's own (not empty, not a starter). */
function StarterPicker({
  text,
  onPick,
}: {
  text: string;
  onPick: (dockerfile: string) => void;
}): ReactElement {
  const own = text.trim() !== '' && !STARTERS.some((starter) => starter.dockerfile === text);
  const [asked, setAsked] = useState<(typeof STARTERS)[number] | null>(null);
  if (asked) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-2 text-xs">
        <span>Replace your Dockerfile with the {asked.label} example?</span>
        <Button
          size="sm"
          variant="danger"
          onClick={() => {
            onPick(asked.dockerfile);
            setAsked(null);
          }}
        >
          Replace
        </Button>
        <Button
          size="sm"
          onClick={() => {
            setAsked(null);
          }}
        >
          Keep mine
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
      <span>Start from:</span>
      {STARTERS.map((starter) => (
        <Button
          key={starter.id}
          size="sm"
          onClick={() => {
            if (own) {
              setAsked(starter);
            } else {
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

/** The project's Dockerfile, with the starters above it. */
export function DockerfileEditor({
  text,
  onChange,
}: {
  text: string;
  onChange: (dockerfile: string) => void;
}): ReactElement {
  return (
    <div className="space-y-2">
      <StarterPicker text={text} onPick={onChange} />
      <Field
        label="Dockerfile"
        hint="The last stage starts FROM union-agent (Node, Bun, pnpm, yarn) or FROM union-agent-base (git and the claude CLI only). Install into system paths, not /home/node. Built with no files from the repository."
      >
        <CodeTextarea
          language="dockerfile"
          className="min-h-72 resize-y"
          value={text}
          onChange={onChange}
        />
      </Field>
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
        <CodeTextarea
          language="dockerfile"
          aria-label="Dockerfile of the default image"
          className="min-h-72 resize-y"
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
