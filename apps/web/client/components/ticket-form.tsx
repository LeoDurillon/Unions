// The form that creates a ticket, with its parent and attached files.
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { useState, type ReactElement, type SubmitEvent } from 'react';

import { api } from '../lib/api';
import { attachmentsApi, type PendingFile } from '../lib/attachments-api';
import { PendingFilesField } from './attachments';
import { ParentPicker } from './parent-picker';
import { Button, ErrorText, Field, inputClass } from './ui';

function ParentField({
  projectId,
  value,
  onChange,
}: {
  projectId: number;
  value: number | null;
  onChange: (parentId: number | null) => void;
}): ReactElement {
  return (
    <Field
      label="Depends on"
      hint="Optional. The ticket starts only once its parent is done, from the parent's branch."
    >
      <ParentPicker projectId={projectId} ticketId={null} value={value} onChange={onChange} />
    </Field>
  );
}

/** One by one; on a failure the files not sent yet are kept (`keep`), so a retry sends only them. */
async function uploadPending(
  ticketId: number,
  files: PendingFile[],
  keep: (files: PendingFile[]) => void,
): Promise<void> {
  let remaining = files;
  try {
    for (const pending of files) {
      // oxlint-disable-next-line no-await-in-loop -- one by one, see above
      await attachmentsApi.upload(ticketId, pending);
      remaining = remaining.slice(1);
    }
  } catch (error) {
    keep(remaining);
    throw new Error(
      `The ticket was created, but a file could not be uploaded: ${error instanceof Error ? error.message : String(error)}. Remove it and submit again, or add the files later from the ticket's Overview tab.`,
      { cause: error },
    );
  }
}

function submitLabel(pending: boolean, created: boolean): string {
  if (pending) {
    return 'Creating…';
  }
  return created ? 'Upload the files and open the ticket' : 'Create ticket';
}

type NewTicket = { projectId: number; title: string; body: string; parentId: number | null };

/** Creates the ticket, then uploads its files; a retry after a failed upload reuses the ticket. */
function useCreateTicket(
  ticket: NewTicket,
  { files, setFiles }: { files: PendingFile[]; setFiles: (files: PendingFile[]) => void },
  onCreated: (ticketId: number) => void,
): { create: UseMutationResult<number, Error, void>; created: boolean } {
  const queryClient = useQueryClient();
  const [createdId, setCreatedId] = useState<number | null>(null);
  const create = useMutation({
    mutationFn: async () => {
      let id = createdId;
      if (id === null) {
        ({ id } = await api.createTicket(ticket));
      }
      setCreatedId(id);
      await uploadPending(id, files, setFiles);
      return id;
    },
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: ['tickets'] });
      onCreated(id);
    },
  });
  return { create, created: createdId !== null };
}

export function TicketForm({
  projectId,
  onCreated,
  initialTitle = '',
  initialBody = '',
}: {
  projectId: number;
  onCreated: (ticketId: number) => void;
  initialTitle?: string;
  initialBody?: string;
}): ReactElement {
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [parentId, setParentId] = useState<number | null>(null);
  const [files, setFiles] = useState<PendingFile[]>([]);
  const { create, created } = useCreateTicket(
    { projectId, title, body, parentId },
    { files, setFiles },
    onCreated,
  );

  const submit = (event: SubmitEvent): void => {
    event.preventDefault();
    create.mutate();
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Title">
        <input
          className={inputClass}
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
          }}
          required
        />
      </Field>
      <Field label="Description" hint="Markdown. This becomes the GitHub issue body.">
        <textarea
          className={`${inputClass} min-h-40 font-mono`}
          value={body}
          onChange={(event) => {
            setBody(event.target.value);
          }}
        />
      </Field>
      <ParentField projectId={projectId} value={parentId} onChange={setParentId} />
      <PendingFilesField files={files} onChange={setFiles} />
      <ErrorText error={create.error} />
      <Button type="submit" variant="primary" disabled={create.isPending}>
        {submitLabel(create.isPending, created)}
      </Button>
    </form>
  );
}
