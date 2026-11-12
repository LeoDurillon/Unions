// Union settings → Resources: the memory each agent container and each preview service may use, and the CPU cores of each.

import type { ReactElement } from 'react';

import type { UnionSettingsView } from '../../../src/routes/union-settings';
import { useResourcesForm, useUnionSettings } from '../../lib/union-settings/use-resources-form';
import { SaveBar } from '../settings/save-bar';
import { SettingsIntro } from '../settings/settings-intro';
import { Loading, SkeletonRows } from '../ui/skeleton';
import { ErrorText, Field, inputClass } from '../ui/ui';

const MIN_GB = 1;
const MAX_GB = 64;
/** The fields the form shows, for its shape while it is read. */
const FIELDS = 3;

function NumberField({
  label,
  hint,
  unit,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  unit: string;
  value: number;
  onChange: (value: number) => void;
}): ReactElement {
  return (
    <Field label={label} hint={hint}>
      <span className="flex items-center gap-2">
        <input
          type="number"
          min={MIN_GB}
          max={MAX_GB}
          step={1}
          className={`${inputClass} w-24`}
          value={value}
          onChange={(event) => {
            onChange(Number(event.target.value));
          }}
        />
        {unit}
      </span>
    </Field>
  );
}

function ResourcesIntro(): ReactElement {
  return (
    <SettingsIntro>
      How much memory and how many CPU cores each container Union starts may use. Past it, the
      biggest process in that container is stopped, instead of your whole computer running out of
      memory. A change applies the next time a container starts.
    </SettingsIntro>
  );
}

function ResourcesForm({ saved }: { saved: UnionSettingsView }): ReactElement {
  const form = useResourcesForm(saved);
  return (
    <section className="space-y-4">
      <NumberField
        unit="GB"
        label="Memory per agent container"
        hint="Each ticket's container, and those of reviews, investigations and checkouts. 4 GB fits most builds; raise it if a build or test run is killed."
        value={form.value.agentMemoryGb}
        onChange={(agentMemoryGb) => {
          form.set({ ...form.value, agentMemoryGb });
        }}
      />
      <NumberField
        unit="GB"
        label="Memory per preview service"
        hint="Each service of a preview (the app, its database, …), unless the compose file sets a lower limit itself."
        value={form.value.previewServiceMemoryGb}
        onChange={(previewServiceMemoryGb) => {
          form.set({ ...form.value, previewServiceMemoryGb });
        }}
      />
      <NumberField
        unit="cores"
        label="CPUs per container"
        hint="The cores each agent container and each preview may use. Tools that size their workers to the machine (nproc, Vitest, recent Jest) then start fewer; a few, like Next.js builds, still count every core of the computer."
        value={form.value.cpus}
        onChange={(cpus) => {
          form.set({ ...form.value, cpus });
        }}
      />
      <SaveBar state={form} />
    </section>
  );
}

/** The page: the saved values, then the form. */
export function ResourcesPage(): ReactElement {
  const settings = useUnionSettings();
  if (settings.data === undefined) {
    return (
      <>
        <ResourcesIntro />
        <section className="space-y-4">
          {settings.error ? (
            <ErrorText error={settings.error} />
          ) : (
            <Loading label="Reading the resources" className="space-y-4">
              <SkeletonRows
                count={FIELDS}
                columns="grid-cols-[10rem_6rem]"
                cells={1}
                rowClassName="h-8"
              />
            </Loading>
          )}
        </section>
      </>
    );
  }
  return (
    <>
      <ResourcesIntro />
      <ResourcesForm saved={settings.data} />
    </>
  );
}
