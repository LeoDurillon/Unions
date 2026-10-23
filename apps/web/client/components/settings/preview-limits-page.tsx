// How long a preview nobody visits keeps running, and how many of the project's run at once.
import { DEFAULT_IDLE_STOP_MINUTES } from '@union/core/preview';
import type { ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { TextField } from './preview-fields';
import { PreviewSave, usePreviewForm } from './preview-form';
import { SetUpFirst } from './set-up-first';

/** How long a preview nobody visits keeps running, and how many of the project's run at once. */
export function PreviewLimitsPage({ project }: { project: PublicProject }): ReactElement {
  const preview = usePreviewForm(project);
  const { value: form, set: setForm } = preview;
  if (!project.config.preview) {
    return (
      <SetUpFirst section="preview-services" what="Choose the compose file and its services" />
    );
  }
  return (
    <section className="space-y-4">
      <p className="text-sm text-zinc-500">
        Previews are served to this machine only (http://t&lt;ticket&gt;.union.localhost). Each one
        holds its own containers and database: these keep the machine&apos;s memory in check.
      </p>
      <TextField
        label="Stop after (minutes without a visit)"
        hint={`A running preview stops once nobody opened it for this long: ${DEFAULT_IDLE_STOP_MINUTES} when empty, 0 for never. Never while the agent runs a step on the ticket or its e2e tests run.`}
        value={form.idleStopMinutes}
        placeholder={String(DEFAULT_IDLE_STOP_MINUTES)}
        onChange={(idleStopMinutes) => {
          setForm({ ...form, idleStopMinutes });
        }}
      />
      <TextField
        label="Previews running at once"
        hint="At most this many of the project's previews (empty: only Union's limit for all projects, 3 unless UNION_MAX_PREVIEWS says otherwise)."
        value={form.maxRunning}
        placeholder="3"
        onChange={(maxRunning) => {
          setForm({ ...form, maxRunning });
        }}
      />
      <PreviewSave project={project} form={preview} />
    </section>
  );
}
