// Project settings → Agent image: what the agents run on now, then the image to build for them. Save and build
// applies it once it passes.

import type { ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { useAgentImage } from '../../lib/settings/use-agent-image';
import { ErrorText } from '../ui/ui';
import { ImageForm } from './agent-image-form';
import { AgentImageLoading, AgentImageStatus } from './agent-image-status';
import { SettingsIntro } from './settings-intro';

/** Project settings → Agent image. */
export function AgentImageSection({ project }: { project: PublicProject }): ReactElement {
  const { image } = useAgentImage(project.id);
  return (
    <>
      <SettingsIntro>
        The image every ticket&apos;s container, investigation and agent review of this project runs
        in. A new one is built and checked when you save, and used only once it passes: until then,
        and if it fails, the agents keep the current one.
      </SettingsIntro>
      <ErrorText error={image.error} />
      {image.isPending ? (
        <section>
          <AgentImageLoading />
        </section>
      ) : null}
      {image.data ? (
        <>
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Status</h3>
            <AgentImageStatus view={image.data} />
          </section>
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Image</h3>
            <ImageForm projectId={project.id} view={image.data} />
          </section>
        </>
      ) : null}
    </>
  );
}
