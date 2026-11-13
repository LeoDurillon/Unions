// Moving a Jira issue in its tab: the transitions its workflow offers from where it is, read when the editor opens.

import { useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import { request } from '../../lib/app/api';
import type { TrackerDraft } from '../../lib/integrations/tracker-draft';
import { ErrorText, Field, inputClass } from '../ui/ui';

/** A transition as the route answers it: its id, its name, the status it leads to. */
type Move = { id: string; name: string; toName: string };

export function JiraStatusInput({
  ticketId,
  draft,
  onChange,
}: {
  ticketId: number;
  draft: TrackerDraft;
  onChange: (draft: TrackerDraft) => void;
}): ReactElement {
  const transitions = useQuery({
    queryKey: ['jira-transitions', ticketId],
    queryFn: () => request<Move[]>('GET', `/api/tickets/${ticketId}/jira-transitions`),
    staleTime: 0,
    retry: false,
  });
  const [picked] = draft.picks;
  return (
    <Field label="Move to" hint="The moves the issue's workflow offers from its status.">
      <select
        className={inputClass}
        value={picked?.id ?? ''}
        disabled={!transitions.data}
        onChange={(event) => {
          const move = transitions.data?.find((one) => one.id === event.target.value);
          onChange(
            move
              ? {
                  value: move.toName,
                  picks: [{ id: move.id, name: move.toName }],
                  text: move.toName,
                }
              : { value: draft.value, picks: [], text: draft.value },
          );
        }}
      >
        <option value="">{transitions.isPending ? 'Reading the moves…' : 'Pick a move…'}</option>
        {(transitions.data ?? []).map((move) => (
          <option key={move.id} value={move.id}>
            {move.name === move.toName ? move.toName : `${move.name} → ${move.toName}`}
          </option>
        ))}
      </select>
      <ErrorText error={transitions.error} />
    </Field>
  );
}
