// Fetches an item of a tracker the project is connected to (a Notion page), previews it, and creates the ticket.
import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import { integrationKind, type IntegrationKindName } from '@union/core/integration-kinds';
import type { PipelineStep } from '@union/core/states';
import { useState, type ReactElement } from 'react';

import type { SourceImport, TicketSummary } from '../../../src/api-types';
import { api } from '../../lib/api';
import { integrationsApi } from '../../lib/integrations-api';
import { Markdown } from '../markdown';
import { Button, ErrorText, Field, inputClass } from '../ui';

function Preview({
  kind,
  item,
  creating,
  onCreate,
  onEdit,
}: {
  kind: IntegrationKindName;
  item: SourceImport;
  creating: boolean;
  onCreate: () => void;
  onEdit: () => void;
}): ReactElement {
  const { label, itemLabel } = integrationKind(kind);
  return (
    <div className="space-y-3">
      <div className="max-h-72 space-y-2 overflow-y-auto rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
        <h3 className="font-semibold">{item.title}</h3>
        <Markdown>{item.body}</Markdown>
      </div>
      {item.truncated ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          The {itemLabel} is very long: {label} returned only its first part.
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button variant="primary" disabled={creating} onClick={onCreate}>
          {creating ? 'Creating…' : 'Create ticket'}
        </Button>
        <Button onClick={onEdit}>Edit before creating</Button>
      </div>
    </div>
  );
}

function RefInput({
  kind,
  value,
  pending,
  onChange,
  onFetch,
}: {
  kind: IntegrationKindName;
  value: string;
  pending: boolean;
  onChange: (value: string) => void;
  onFetch: () => void;
}): ReactElement {
  const { label, itemLabel, sourceLabel } = integrationKind(kind);
  const name = `${label} ${itemLabel} ID or URL`;
  return (
    <Field label={name} hint={`The ${itemLabel} must be in the project's ${label} ${sourceLabel}.`}>
      <div className="flex gap-2">
        <input
          className={`${inputClass} font-mono`}
          aria-label={name}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
        <Button disabled={value.trim() === '' || pending} onClick={onFetch}>
          {pending ? 'Fetching…' : 'Fetch'}
        </Button>
      </div>
    </Field>
  );
}

/** Creates the ticket from the fetched item, linked to it. */
function useCreate(
  projectId: number,
  kind: IntegrationKindName,
  flow: PipelineStep[] | null,
  onCreated: (ticketId: number) => void,
): UseMutationResult<TicketSummary, Error, SourceImport> {
  return useMutation({
    mutationFn: (found: SourceImport) =>
      api.createTicket({
        projectId,
        title: found.title,
        body: found.body,
        origin: { kind, id: found.id, url: found.url },
        flow,
      }),
    onSuccess: (ticket) => {
      onCreated(ticket.id);
    },
  });
}

/** Fetches an item of the project's source of this kind, previews it, and creates the ticket. */
export function SourceImportPanel({
  projectId,
  kind,
  flow,
  onCreated,
  onEdit,
}: {
  projectId: number;
  kind: IntegrationKindName;
  flow: PipelineStep[] | null;
  onCreated: (ticketId: number) => void;
  /** Opens the item in the form, still linked to it. */
  onEdit: (item: SourceImport) => void;
}): ReactElement {
  const [ref, setRef] = useState('');
  const fetchItem = useMutation({
    mutationFn: () => integrationsApi.importItem(projectId, kind, ref.trim()),
  });
  const create = useCreate(projectId, kind, flow, onCreated);
  const found = fetchItem.data;

  return (
    <div className="space-y-4">
      <RefInput
        kind={kind}
        value={ref}
        pending={fetchItem.isPending}
        onChange={(value) => {
          setRef(value);
          fetchItem.reset();
        }}
        onFetch={() => {
          fetchItem.mutate();
        }}
      />
      <ErrorText error={fetchItem.error ?? create.error} />
      {found ? (
        <Preview
          kind={kind}
          item={found}
          creating={create.isPending}
          onCreate={() => {
            create.mutate(found);
          }}
          onEdit={() => {
            onEdit(found);
          }}
        />
      ) : null}
    </div>
  );
}
