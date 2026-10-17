// The ticket's flow in its details: chosen while in Backlog, shown as fixed once it started.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { flowName, resolveFlow } from '@union/core/flows';
import type { PipelineStep } from '@union/core/states';
import { useState, type ReactElement } from 'react';

import type { TicketDetail } from '../../src/api-types';
import { api } from '../lib/api';
import { DetailRow } from './detail-row';
import { FlowPicker, flowSteps } from './flow-picker';
import { Button, ErrorText } from './ui';

const HINT = 'The steps the ticket runs, fixed when it starts';

export function FlowRow({ detail }: { detail: TicketDetail }): ReactElement {
  const { ticket, project } = detail;
  const queryClient = useQueryClient();
  const [picking, setPicking] = useState(false);
  const change = useMutation({
    mutationFn: (flow: PipelineStep[] | null) => api.setFlow(ticket.id, flow),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['ticket'] }),
  });
  const flow = resolveFlow(ticket, project.config);
  const editable = ticket.phase.kind === 'backlog';
  return (
    <DetailRow label="Flow" hint={HINT}>
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span>{flowName(flow, project.config)}</span>
          {picking ? null : <span className="text-xs text-zinc-500">{flowSteps(flow)}</span>}
          {editable ? (
            <Button
              className="ml-auto"
              onClick={() => {
                setPicking(!picking);
              }}
            >
              {picking ? 'Close' : 'Change'}
            </Button>
          ) : null}
        </div>
        <ErrorText error={change.error} />
        {picking && editable ? (
          <FlowPicker
            config={project.config}
            value={ticket.flow}
            onChange={(next) => {
              change.mutate(next);
            }}
          />
        ) : null}
      </div>
    </DetailRow>
  );
}
