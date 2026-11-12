// The preview's card: its status and menu, its services, its buttons, the reset and compose panels, its output.

import type { PreviewService } from '@union/core/preview';
import { useState, type ReactElement, type ReactNode } from 'react';

import type { PreviewState } from '../../lib/preview/use-preview';
import { CARD_CLASS, ErrorText } from '../ui/ui';
import { PreviewComposeDialog } from './preview-compose-dialog';
import { Controls } from './preview-controls';
import { PreviewHeading } from './preview-heading';
import { PreviewOutput } from './preview-output';
import { ResetPanel } from './preview-reset';
import { PreviewServices } from './preview-services';

type PreviewCardProps = PreviewState & {
  error: Error | null;
  notice?: ReactNode;
  services: readonly PreviewService[];
};

export function PreviewCard({
  target,
  view,
  calls,
  act,
  busy,
  error,
  notice,
  services,
}: PreviewCardProps): ReactElement {
  const [composeOpen, setComposeOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const { preview } = view;
  return (
    <section className={CARD_CLASS}>
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
      <PreviewServices services={services} preview={preview} />
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
    </section>
  );
}
