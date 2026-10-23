// The project's own instructions, sent to every agent run on it after the shared instructions.
import type { ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { api } from '../../lib/api';
import { openUnionSettings } from '../../lib/union-settings-sections';
import { useSettingsForm } from '../../lib/use-settings-form';
import { inputClass } from '../ui';
import { SaveBar } from './save-bar';

const PLACEHOLDER = `## Stack
Bun workspace, Hono API in apps/web, React client in apps/web/client.

## Conventions
- Run \`bun run check\` before committing.
- Never edit generated files under drizzle/.`;

/** The project's own instructions, sent to every agent run on it after the shared instructions. */
export function InstructionsSection({ project }: { project: PublicProject }): ReactElement {
  const form = useSettingsForm(
    () => project.config.instructions ?? '',
    (instructions) => api.updateProject(project.id, { instructions }),
  );

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">Project instructions</h3>
      <p className="text-xs text-zinc-500">
        Sent to every agent working on this project (ticket steps and investigations), after the{' '}
        <button
          type="button"
          className="text-indigo-600 hover:underline dark:text-indigo-400"
          onClick={() => {
            openUnionSettings('shared');
          }}
        >
          shared instructions
        </button>
        : stack, conventions, commands, things to avoid. Applies from the next agent run.
      </p>
      <textarea
        aria-label="Project instructions"
        className={`${inputClass} min-h-72 font-mono text-xs`}
        value={form.value}
        placeholder={PLACEHOLDER}
        onChange={(event) => {
          form.set(event.target.value);
        }}
      />
      <SaveBar state={form} />
    </section>
  );
}
