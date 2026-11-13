// Union settings → Resources: each container's memory and CPU cores, and how many agent runs and previews at once.

import { COUNT_BOUNDS, GB_BOUNDS } from '@union/core/union-settings-fields';
import type { ReactElement } from 'react';

import type { UnionSettingsView } from '../../../src/routes/union-settings';
import type { SettingsForm } from '../../lib/settings/use-settings-form';
import { useUnionSettingsForm } from '../../lib/union-settings/use-union-settings-form';
import { SaveBar } from '../settings/save-bar';
import { NumberField } from './union-settings-fields';
import { UnionSettingsLoader } from './union-settings-loader';

/** The fields the form shows, for its shape while it is read. */
const FIELDS = 5;

type FormProps = { form: SettingsForm<UnionSettingsView> };

function ContainerFields({ form }: FormProps): ReactElement {
  return (
    <>
      <NumberField
        unit="GB"
        bounds={GB_BOUNDS}
        label="Memory per agent container"
        hint="Each ticket's container, and those of reviews, investigations and checkouts. 4 GB fits most builds; raise it if a build or test run is killed."
        value={form.value.agentMemoryGb}
        onChange={(agentMemoryGb) => {
          form.set({ ...form.value, agentMemoryGb });
        }}
      />
      <NumberField
        unit="GB"
        bounds={GB_BOUNDS}
        label="Memory per preview service"
        hint="Each service of a preview (the app, its database, …), unless the compose file sets a lower limit itself."
        value={form.value.previewServiceMemoryGb}
        onChange={(previewServiceMemoryGb) => {
          form.set({ ...form.value, previewServiceMemoryGb });
        }}
      />
      <NumberField
        unit="cores"
        bounds={COUNT_BOUNDS.cpus}
        label="CPUs per container"
        hint="The cores each agent container and each preview may use. Tools that size their workers to the machine (nproc, Vitest, recent Jest) then start fewer; a few, like Next.js builds, still count every core of the computer."
        value={form.value.cpus}
        onChange={(cpus) => {
          form.set({ ...form.value, cpus });
        }}
      />
    </>
  );
}

function AtOnceFields({ form }: FormProps): ReactElement {
  return (
    <>
      <NumberField
        unit="runs"
        bounds={COUNT_BOUNDS.maxConcurrentRuns}
        label="Agent runs at once"
        hint="Ticket steps, investigations, agent reviews and rewrites share these; the others wait their turn. Each uses its container's memory, and your Claude usage."
        value={form.value.maxConcurrentRuns}
        onChange={(maxConcurrentRuns) => {
          form.set({ ...form.value, maxConcurrentRuns });
        }}
      />
      <NumberField
        unit="previews"
        bounds={COUNT_BOUNDS.maxPreviews}
        label="Previews at once"
        hint="Across all projects; a project can allow fewer (its Environments → Limits). Past it, starting one asks you to stop another first."
        value={form.value.maxPreviews}
        onChange={(maxPreviews) => {
          form.set({ ...form.value, maxPreviews });
        }}
      />
    </>
  );
}

function ResourcesForm({ saved }: { saved: UnionSettingsView }): ReactElement {
  const form = useUnionSettingsForm(saved);
  return (
    <section className="space-y-4">
      <ContainerFields form={form} />
      <AtOnceFields form={form} />
      <SaveBar state={form} />
    </section>
  );
}

/** The page: the saved values, then the form. */
export function ResourcesPage(): ReactElement {
  return (
    <UnionSettingsLoader
      intro="How much memory and how many CPU cores each container Union starts may use, and how many run at once. Past its memory, the biggest process in that container is stopped, instead of your whole computer running out of memory. A change applies the next time a container or a run starts."
      label="Reading the resources"
      fields={FIELDS}
      form={ResourcesForm}
    />
  );
}
