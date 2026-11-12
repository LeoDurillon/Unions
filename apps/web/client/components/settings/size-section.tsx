// Project settings → Change size: the budget of a ticket whose plan gives no estimate, and the paths that are not code.

import { DEFAULT_SIZE_IGNORE } from '@union/core/change-size';
import type { ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { api } from '../../lib/app/api';
import { useSettingsForm } from '../../lib/settings/use-settings-form';
import { Field, inputClass } from '../ui/ui';
import { SaveBar } from './save-bar';
import { SettingsIntro } from './settings-intro';

type Size = { budget: string; patterns: string };

function initial(project: PublicProject): Size {
  return {
    budget: project.config.sizeBudget === undefined ? '' : String(project.config.sizeBudget),
    patterns: (project.config.sizeIgnore ?? []).join('\n'),
  };
}

function save(projectId: number, { budget, patterns }: Size): Promise<PublicProject> {
  const lines = patterns.split('\n').filter((line) => line.trim() !== '');
  return api.updateProject(projectId, {
    sizeBudget: budget.trim() === '' ? null : Number(budget),
    sizeIgnore: lines.length === 0 ? null : lines,
  });
}

/** The budget of a ticket whose plan gives no estimate, and the paths that are not code. */
export function SizeSection({ project }: { project: PublicProject }): ReactElement {
  const form = useSettingsForm(
    () => initial(project),
    (size) => save(project.id, size),
  );
  const { value } = form;
  return (
    <>
      <SettingsIntro>
        Union counts the lines of code each implementation adds. The technical plan estimates them;
        when a first implementation goes over half again its estimate, the agent is asked once to
        cut what the task does not need and to say why the rest is needed.
      </SettingsIntro>
      <section className="space-y-3">
        <Field
          label="Budget without an estimate"
          hint="Lines of code for a ticket whose flow skips the technical step, or whose plan gives no estimate. Empty: none, the size is only shown."
        >
          <input
            className={`${inputClass} max-w-32`}
            type="number"
            min={1}
            value={value.budget}
            placeholder="none"
            onChange={(event) => {
              form.set({ ...value, budget: event.target.value });
            }}
          />
        </Field>
        <Field
          label="Not code"
          hint="Gitignore-style patterns, one per line: their lines are counted apart (tests, other). Empty: the defaults shown."
        >
          <textarea
            className={`${inputClass} min-h-40 font-mono`}
            value={value.patterns}
            placeholder={DEFAULT_SIZE_IGNORE.join('\n')}
            onChange={(event) => {
              form.set({ ...value, patterns: event.target.value });
            }}
          />
        </Field>
        <SaveBar state={form} />
      </section>
    </>
  );
}
