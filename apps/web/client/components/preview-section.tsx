// A ticket's or a pull request's preview: its compose environment run from the workspace, opened
// through the proxy.
import { useState, type ReactElement, type ReactNode } from 'react';

import type { PreviewTarget } from '../lib/preview-target';
import { usePreview } from '../lib/use-preview';
import { PreviewComposeDialog } from './preview-compose-dialog';
import { Controls } from './preview-controls';
import { PreviewE2e } from './preview-e2e';
import { PreviewHeading, PreviewNotSetUp } from './preview-heading';
import { PreviewOutput } from './preview-output';
import { ResetPanel } from './preview-reset';
import { ErrorText } from './ui';

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
}: {
  target: PreviewTarget;
  notice?: ReactNode;
  canRevise?: boolean;
}): ReactElement | null {
  const { query, calls, act, busy, error } = usePreview(target);
  const [composeOpen, setComposeOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const view = query.data;
  if (!view) {
    return null;
  }
  if (!view.configured) {
    return <PreviewNotSetUp />;
  }
  const { preview } = view;
  return (
    <section className="space-y-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
      <PreviewHeading
        view={view}
        onCompose={() => {
          setComposeOpen(true);
        }}
        onReset={() => {
          setResetting(true);
        }}
      />
      {notice}
      <Controls view={view} calls={calls} act={act} busy={busy} />
      {resetting ? (
        <ResetPanel
          view={view}
          calls={calls}
          act={act}
          busy={busy}
          onClose={() => {
            setResetting(false);
          }}
        />
      ) : null}
      <PreviewComposeDialog
        target={target}
        view={view}
        open={composeOpen}
        onClose={() => {
          setComposeOpen(false);
        }}
      />
      <ErrorText error={error} />
      {preview ? (
        <PreviewOutput target={target} preview={preview} calls={calls} act={act} busy={busy} />
      ) : null}
      <PreviewE2e target={target} view={view} canRevise={canRevise} />
    </section>
  );
}
