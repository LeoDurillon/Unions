// The preview's title line: its status, how long a start has run, and the less frequent actions.
import type { Preview } from '@union/core';
import type { ReactElement } from 'react';

import type { PreviewView } from '../../src/api-types';
import { PREVIEW_STATUS } from '../lib/preview-status';
import { clock } from '../lib/relative-time';
import { openSettings } from '../lib/settings-sections';
import { useNow } from '../lib/use-now';
import { OverflowMenu } from './overflow-menu';
import { canOfferReset } from './preview-reset';
import { Badge } from './ui';

/** How long the start has run, counting while it does. */
function Elapsed({ preview }: { preview: Preview }): ReactElement | null {
  const starting = preview.status === 'starting';
  const now = useNow(starting);
  if (!starting || preview.startedAt === null) {
    return null;
  }
  return (
    <span className="font-normal text-zinc-500 tabular-nums">{clock(now - preview.startedAt)}</span>
  );
}

/** The preview's title line: its status, how long a start has run, and the less frequent actions. */
export function PreviewHeading({
  view,
  onCompose,
  onReset,
}: {
  view: PreviewView;
  onCompose: () => void;
  onReset: () => void;
}): ReactElement {
  const { preview } = view;
  return (
    <h3 className="flex items-center gap-2 text-sm font-semibold">
      Preview
      {preview ? (
        <Badge tone={PREVIEW_STATUS[preview.status].tone}>
          {PREVIEW_STATUS[preview.status].label}
        </Badge>
      ) : null}
      {preview ? <Elapsed preview={preview} /> : null}
      <span className="ml-auto font-normal">
        <OverflowMenu
          label="More preview actions"
          items={[
            {
              label: preview?.override ? 'Compose file (yours)' : 'Compose file',
              onSelect: onCompose,
            },
            ...(canOfferReset(view)
              ? [
                  {
                    label: 'Reset preview…',
                    onSelect: onReset,
                    refusal: view.resetRefusal,
                    danger: true,
                  },
                ]
              : []),
            {
              label: 'Preview settings',
              onSelect: () => {
                openSettings('preview-services');
              },
            },
          ]}
        />
      </span>
    </h3>
  );
}

/** A project without preview settings: where to set them. */
export function PreviewNotSetUp(): ReactElement {
  return (
    <p className="text-xs text-zinc-500">
      Previews are not set up for this project.{' '}
      <button
        type="button"
        className="text-indigo-600 hover:underline dark:text-indigo-400"
        onClick={() => {
          openSettings('preview-services');
        }}
      >
        Set up previews
      </button>
    </p>
  );
}
