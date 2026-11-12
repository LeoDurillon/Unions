// A ticket's or a pull request's preview: why a start failed, its card with its services, and its e2e tests.
// Its compose environment runs from the workspace, opened through the proxy.

import type { PreviewService } from '@union/core/preview';
import type { ReactElement, ReactNode } from 'react';

import type { PreviewTarget } from '../../lib/preview/preview-target';
import { usePreview } from '../../lib/preview/use-preview';
import { PreviewCard } from './preview-card';
import { PreviewE2e } from './preview-e2e';
import { PreviewFailure } from './preview-failure';
import { PreviewNotSetUp } from './preview-heading';

const NO_SERVICES: readonly PreviewService[] = [];

/**
 * A ticket's or a pull request's preview: its compose environment run from the workspace, opened
 * through the proxy. Start and stop are commands the worker runs; a ticket's panel follows the live
 * events, a pull request's polls while one is on its way. `notice` goes above the controls;
 * `canRevise`: a ticket's failing tests can go back to the agent.
 */
export function PreviewSection({
  target,
  notice,
  canRevise = false,
  services = NO_SERVICES,
}: {
  target: PreviewTarget;
  notice?: ReactNode;
  canRevise?: boolean;
  /** The settings' exposed services, for their rows before the preview ever ran; else its addresses. */
  services?: readonly PreviewService[];
}): ReactElement | null {
  const { query, calls, act, busy, error } = usePreview(target);
  const view = query.data;
  if (!view) {
    return null;
  }
  if (!view.configured) {
    return <PreviewNotSetUp />;
  }
  return (
    <>
      <PreviewFailure view={view} calls={calls} act={act} busy={busy} />
      <PreviewCard
        target={target}
        view={view}
        calls={calls}
        act={act}
        busy={busy}
        error={error}
        notice={notice}
        services={services}
      />
      <PreviewE2e target={target} view={view} canRevise={canRevise} />
    </>
  );
}
