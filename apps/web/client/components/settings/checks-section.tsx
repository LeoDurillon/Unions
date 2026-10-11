import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { api } from '../../lib/api';
import { Button, ErrorText, Field, inputClass } from '../ui';

const DEFAULT_ITERATIONS = 3;

type Checks = { installCommand: string; gateCommand: string; maxIterations: string };

function initial(project: PublicProject): Checks {
  return {
    installCommand: project.config.installCommand ?? '',
    gateCommand: project.config.gateCommand ?? '',
    maxIterations: String(project.config.maxIterations ?? DEFAULT_ITERATIONS),
  };
}

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
    <Field label="Iteration limit" hint="Agent turns before the step ends, even if checks are red.">
      <input
        className={`${inputClass} w-24`}
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

/** How the implementation agent's work is installed and checked inside the ticket's container. */
export function ChecksSection({ project }: { project: PublicProject }): ReactElement {
  const queryClient = useQueryClient();
  const [checks, setChecks] = useState(() => initial(project));
  const save = useMutation({
    mutationFn: () =>
      api.updateProject(project.id, { ...checks, maxIterations: Number(checks.maxIterations) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });
  const change =
    (key: keyof Checks) =>
    (value: string): void => {
      setChecks((previous) => ({ ...previous, [key]: value }));
      save.reset();
    };
  const dirty = JSON.stringify(checks) !== JSON.stringify(initial(project));

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">Checks</h3>
      <p className="text-xs text-zinc-500">
        Run in the ticket&apos;s container after each implementation turn. Red checks go back to the
        agent, up to the iteration limit.
      </p>
      <CommandField
        label="Install command"
        hint="Runs once before the agent starts. Leave empty to skip."
        value={checks.installCommand}
        placeholder="bun install"
        onChange={change('installCommand')}
      />
      <CommandField
        label="Check command"
        hint="Exit code 0 means green. Leave empty to skip the checks."
        value={checks.gateCommand}
        placeholder="bun run check"
        onChange={change('gateCommand')}
      />
      <IterationField value={checks.maxIterations} onChange={change('maxIterations')} />
      <ErrorText error={save.error} />
      <Button
        disabled={!dirty || save.isPending}
        onClick={() => {
          save.mutate();
        }}
      >
        Save checks
      </Button>
      {save.isSuccess ? <p className="text-sm text-green-700 dark:text-green-400">Saved.</p> : null}
    </section>
  );
}
