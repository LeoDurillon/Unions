// Project settings → Agent image: the default image, a Dockerfile built on it, or an image built elsewhere; Save and build applies it once it passes.
import { useState, type ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import type { AgentImageView } from '../../../src/routes/agent-image';
import { useLeaveGuard } from '../../lib/leave-guard';
import { isBuilding, useAgentImage, type AgentImageChoice } from '../../lib/use-agent-image';
import { Segmented } from '../choice';
import { Button, ErrorText, Field, inputClass } from '../ui';
import { AgentImageStatus } from './agent-image-status';

const STARTER = `FROM union-agent
# The base image has node, Bun, pnpm and yarn, git, the claude CLI and Playwright's libraries.
# Add what this project's install, checks and tests need, as root, then go back to the node user.
USER root
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip \\
    && rm -rf /var/lib/apt/lists/*
USER node
`;

type Kind = AgentImageChoice['kind'];
type Draft = { kind: Kind; dockerfile: string; ref: string };

const KINDS: { value: Kind; label: string }[] = [
  { value: 'default', label: 'Default image' },
  { value: 'dockerfile', label: 'Dockerfile' },
  { value: 'image', label: 'Existing image' },
];

/** The form starts from what was saved last: the pending choice, else the applied one. */
function draftOf(view: AgentImageView): Draft {
  const choice = view.pending ?? view.applied ?? { kind: 'default' as const };
  return {
    kind: choice.kind,
    dockerfile: choice.kind === 'dockerfile' ? choice.dockerfile : STARTER,
    ref: choice.kind === 'image' ? choice.ref : '',
  };
}

function choiceOf(draft: Draft): AgentImageChoice {
  if (draft.kind === 'dockerfile') {
    return { kind: 'dockerfile', dockerfile: draft.dockerfile };
  }
  return draft.kind === 'image' ? { kind: 'image', ref: draft.ref } : { kind: 'default' };
}

function sameChoice(a: AgentImageChoice, b: AgentImageChoice): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function SourceFields({
  draft,
  onChange,
}: {
  draft: Draft;
  onChange: (draft: Draft) => void;
}): ReactElement | null {
  if (draft.kind === 'dockerfile') {
    return (
      <Field
        label="Dockerfile"
        hint="Starts with FROM union-agent. Built with no files from the repository: COPY works only from another stage."
      >
        <textarea
          className={`${inputClass} min-h-72 font-mono text-xs`}
          spellCheck={false}
          value={draft.dockerfile}
          onChange={(event) => {
            onChange({ ...draft, dockerfile: event.target.value });
          }}
        />
      </Field>
    );
  }
  if (draft.kind === 'image') {
    return (
      <Field
        label="Image"
        hint="Pulled on save, then checked: it must be built on union-agent (the claude CLI, git, the node user)."
      >
        <input
          className={`${inputClass} font-mono`}
          placeholder="ghcr.io/acme/agent:1.4"
          value={draft.ref}
          onChange={(event) => {
            onChange({ ...draft, ref: event.target.value });
          }}
        />
      </Field>
    );
  }
  return null;
}

function ImageForm({ projectId, view }: { projectId: number; view: AgentImageView }): ReactElement {
  const { save, discard } = useAgentImage(projectId);
  const [draft, setDraft] = useState(() => draftOf(view));
  const saved = choiceOf(draftOf(view));
  const dirty = !sameChoice(choiceOf(draft), saved);
  useLeaveGuard(dirty);
  const building = isBuilding(view);
  return (
    <div className="space-y-3">
      <Segmented
        legend="Image the agents run on"
        options={KINDS}
        value={draft.kind}
        onChange={(kind) => {
          setDraft({ ...draft, kind });
        }}
      />
      <SourceFields draft={draft} onChange={setDraft} />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          disabled={save.isPending || (!dirty && view.status !== 'failed')}
          onClick={() => {
            save.mutate(choiceOf(draft));
          }}
        >
          {draft.kind === 'default' ? 'Save' : 'Save and build'}
        </Button>
        {building || view.status === 'failed' ? (
          <Button
            disabled={discard.isPending}
            onClick={() => {
              discard.mutate();
            }}
          >
            {building ? 'Cancel the build' : 'Drop this change'}
          </Button>
        ) : null}
      </div>
      <ErrorText error={save.error ?? discard.error} />
    </div>
  );
}

/** Project settings → Agent image. */
export function AgentImageSection({ project }: { project: PublicProject }): ReactElement {
  const { image } = useAgentImage(project.id);
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">Agent image</h3>
        <p className="text-xs text-zinc-500">
          The image every ticket&apos;s container, investigation and agent review of this project
          runs in. A new one is built and checked when you save, and used only once it passes: until
          then, and if it fails, the agents keep the current one.
        </p>
      </div>
      {image.data ? (
        <>
          <AgentImageStatus view={image.data} />
          <ImageForm projectId={project.id} view={image.data} />
        </>
      ) : (
        <ErrorText error={image.error} />
      )}
    </section>
  );
}
