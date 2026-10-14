import { useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import { previewApi } from '../lib/preview-api';
import { openSettings } from '../lib/settings-sections';
import { DetailRow } from './detail-row';
import { PREVIEW_STATUS } from './preview-section';
import { Badge } from './ui';

const LINK = 'text-indigo-600 hover:underline dark:text-indigo-400';

/** The preview in one line of the Overview: its state, where it answers, the way to its tab. */
export function PreviewSummary({
  ticketId,
  onOpenTab,
}: {
  ticketId: number;
  onOpenTab: () => void;
}): ReactElement | null {
  const query = useQuery({
    queryKey: ['ticket', ticketId, 'preview'],
    queryFn: () => previewApi.get(ticketId),
  });
  const view = query.data;
  if (!view) {
    return null;
  }
  const { preview } = view;
  return (
    <DetailRow label="Preview">
      <div className="flex flex-wrap items-center gap-2">
        {view.configured ? (
          <>
            <Badge tone={preview ? PREVIEW_STATUS[preview.status].tone : 'neutral'}>
              {preview ? PREVIEW_STATUS[preview.status].label : 'Not started'}
            </Badge>
            {preview?.status === 'running' && preview.url ? (
              <a className={LINK} href={preview.url} target="_blank" rel="noreferrer">
                Open ↗
              </a>
            ) : null}
            <button type="button" className={LINK} onClick={onOpenTab}>
              Start, stop, logs and tests
            </button>
          </>
        ) : (
          <button
            type="button"
            className={LINK}
            onClick={() => {
              openSettings('preview-services');
            }}
          >
            Not set up: set up previews
          </button>
        )}
      </div>
    </DetailRow>
  );
}
