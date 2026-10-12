import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { api } from '../../lib/api';
import { Button, ErrorText, inputClass } from '../ui';

const PLACEHOLDER = `## Stack
Bun workspace, Hono API in apps/web, React client in apps/web/client.

## Conventions
- Run \`bun run check\` before committing.
- Never edit generated files under drizzle/.`;

/** The project's own instructions, sent to every agent run on it after the shared instructions. */
export function InstructionsSection({ project }: { project: PublicProject }): ReactElement {
  const queryClient = useQueryClient();
  const saved = project.config.instructions ?? '';
  const [text, setText] = useState(saved);
  const save = useMutation({
    mutationFn: () => api.updateProject(project.id, { instructions: text }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });
  const dirty = text.trim() !== saved;

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">Project instructions</h3>
      <p className="text-xs text-zinc-500">
        Sent to every agent working on this project (ticket steps and investigations), after the
        shared instructions from Agent settings: stack, conventions, commands, things to avoid.
        Applies from the next agent run.
      </p>
      <textarea
        aria-label="Project instructions"
        className={`${inputClass} min-h-72 font-mono text-xs`}
        value={text}
        placeholder={PLACEHOLDER}
        onChange={(event) => {
          setText(event.target.value);
          save.reset();
        }}
      />
      <ErrorText error={save.error} />
      <Button
        disabled={!dirty || save.isPending}
        onClick={() => {
          save.mutate();
        }}
      >
        Save instructions
      </Button>
      {save.isSuccess ? <p className="text-sm text-green-700 dark:text-green-400">Saved.</p> : null}
    </section>
  );
}
