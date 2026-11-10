// The services the project's previews share, run once instead of in each preview: their state now,
// which ones, and what keeps each preview's data apart there.

import type { ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { PreviewSave, usePreviewForm } from './preview-form';
import { SetUpServicesFirst } from './set-up-services-first';
import { SharedServicesFields } from './shared-commands-field';
import { SharedServicesStatus } from './shared-services-status';
import { useComposeServices } from './use-compose-services';

/** The services shared between the project's previews: how they are now, which ones, and their commands. */
export function PreviewSharedPage({
  project,
  onOpenTicket,
}: {
  project: PublicProject;
  onOpenTicket: (ticketId: number) => void;
}): ReactElement {
  const preview = usePreviewForm(project);
  const { value: form, set: setForm } = preview;
  const found = useComposeServices(project.id);
  if (!project.config.preview) {
    return <SetUpServicesFirst />;
  }
  return (
    <section className="space-y-4">
      {form.sharedServices.length > 0 ? (
        <SharedServicesStatus projectId={project.id} onOpenTicket={onOpenTicket} />
      ) : null}
      <SharedServicesFields form={form} known={found?.names ?? []} onChange={setForm} />
      <PreviewSave project={project} form={preview} />
    </section>
  );
}
