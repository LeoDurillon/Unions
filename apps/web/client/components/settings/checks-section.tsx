// How the implementation agent's work is installed and checked inside the ticket's container.

import type { ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { api } from '../../lib/app/api';
import { useSettingsForm } from '../../lib/settings/use-settings-form';
import { Field, inputClass } from '../ui/ui';
import { SaveBar } from './save-bar';
import { SettingsIntro } from './settings-intro';

const DEFAULT_ITERATIONS = 3;

function CommandField({
  label,
  hint,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}): ReactElement {
  return (
    <Field label={label} hint={hint}>
      <input
        className={`${inputClass} font-mono`}
        value={value}
        placeholder={placeholder}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
    </Field>
  );
}

const MAX_ITERATIONS = 10;

function IterationField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}): ReactElement {
  return (
    <Field label="Agent turns" hint="Turns before the step ends, even if checks are still red.">
      <input
        className={`${inputClass} max-w-24`}
        type="number"
        min={1}
        max={MAX_ITERATIONS}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
    </Field>
  );
}

/** The commands the container runs: install once, then check after each turn. */
function CommandsCard({ project }: { project: PublicProject }): ReactElement {
  const form = useSettingsForm(
    () => ({
      installCommand: project.config.installCommand ?? '',
      gateCommand: project.config.gateCommand ?? '',
    }),
    (commands) => api.updateProject(project.id, commands),
  );
  const commands = form.value;
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">Commands</h3>
      <p className="text-xs text-zinc-500">
        What the container runs, from the repository&apos;s root.
      </p>
      <CommandField
        label="Install command"
        hint="Runs once before the agent starts. Leave empty to skip."
        value={commands.installCommand}
        placeholder="bun install"
        onChange={(installCommand) => {
          form.set({ ...commands, installCommand });
        }}
      />
      <CommandField
        label="Check command"
        hint="Exit code 0 means green. Leave empty to skip the checks."
        value={commands.gateCommand}
        placeholder="bun run check"
        onChange={(gateCommand) => {
          form.set({ ...commands, gateCommand });
        }}
      />
      <SaveBar state={form} />
    </section>
  );
}

/** How many turns the agent gets before the step ends. */
function IterationCard({ project }: { project: PublicProject }): ReactElement {
  const form = useSettingsForm(
    () => String(project.config.maxIterations ?? DEFAULT_ITERATIONS),
    (value) => api.updateProject(project.id, { maxIterations: Number(value) }),
  );
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">Iteration limit</h3>
      <IterationField
        value={form.value}
        onChange={(value) => {
          form.set(value);
        }}
      />
      <SaveBar state={form} />
    </section>
  );
}

/** How the implementation agent's work is installed and checked inside the ticket's container. */
export function ChecksSection({ project }: { project: PublicProject }): ReactElement {
  return (
    <>
      <SettingsIntro>
        Run in the ticket&apos;s container after each implementation turn. Red checks go back to the
        agent, up to the iteration limit.
      </SettingsIntro>
      <CommandsCard project={project} />
      <IterationCard project={project} />
    </>
  );
}
