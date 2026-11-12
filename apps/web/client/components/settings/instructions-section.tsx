// The project's own instructions, sent to every agent run on it after the shared instructions.

import type { ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { api } from '../../lib/app/api';
import { useSettingsForm } from '../../lib/settings/use-settings-form';
import { openUnionSettings } from '../../lib/union-settings/union-settings-sections';
import { inputClass } from '../ui/ui';
import { SaveBar } from './save-bar';
import { SettingsIntro } from './settings-intro';

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
    <>
      <SettingsIntro>
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
      </SettingsIntro>
      <section className="space-y-3">
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
    </>
  );
}
