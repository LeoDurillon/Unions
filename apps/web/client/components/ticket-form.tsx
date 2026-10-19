// The form that creates a ticket, with its parent and attached files.
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import type { PipelineStep } from '@union/core/states';
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

type NewTicket = {
  projectId: number;
  title: string;
  body: string;
  parentId: number | null;
  flow: PipelineStep[] | null;
  notionPageId?: string;
};

/** A Notion page whose import is edited before the ticket is created. */
export type NotionPageRef = { id: string; title: string };

/** The ticket stays linked to the page (and gets its images) unless unlinked here. */
function NotionLink({
  page,
  onUnlink,
}: {
  page: NotionPageRef;
  onUnlink: () => void;
}): ReactElement {
  return (
    <p className="flex items-center gap-2 text-xs text-zinc-500">
      <span>
        Imported from Notion: <span className="font-medium">{page.title}</span>
      </span>
      <button type="button" className="underline hover:text-zinc-700" onClick={onUnlink}>
        Unlink
      </button>
    </p>
  );
}

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

function TextFields({
  title,
  body,
  onTitle,
  onBody,
}: {
  title: string;
  body: string;
  onTitle: (title: string) => void;
  onBody: (body: string) => void;
}): ReactElement {
  return (
    <>
      <Field label="Title">
        <input
          className={inputClass}
          value={title}
          onChange={(event) => {
            onTitle(event.target.value);
          }}
          required
        />
      </Field>
      <Field label="Description" hint="Markdown. This becomes the GitHub issue body.">
        <textarea
          className={`${inputClass} min-h-40 font-mono`}
          value={body}
          onChange={(event) => {
            onBody(event.target.value);
          }}
        />
      </Field>
    </>
  );
}

export function TicketForm({
  projectId,
  flow,
  onCreated,
  initialTitle = '',
  initialBody = '',
  notionPage = null,
}: {
  projectId: number;
  /** Chosen above the form, for every way of creating the ticket. */
  flow: PipelineStep[] | null;
  onCreated: (ticketId: number) => void;
  initialTitle?: string;
  initialBody?: string;
  notionPage?: NotionPageRef | null;
}): ReactElement {
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [parentId, setParentId] = useState<number | null>(null);
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [linked, setLinked] = useState(notionPage);
  const { create, created } = useCreateTicket(
    { projectId, title, body, parentId, flow, ...(linked ? { notionPageId: linked.id } : {}) },
    { files, setFiles },
    onCreated,
  );

  const submit = (event: SubmitEvent): void => {
    event.preventDefault();
    create.mutate();
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {linked ? (
        <NotionLink
          page={linked}
          onUnlink={() => {
            setLinked(null);
          }}
        />
      ) : null}
      <TextFields title={title} body={body} onTitle={setTitle} onBody={setBody} />
      <ParentField projectId={projectId} value={parentId} onChange={setParentId} />
      <PendingFilesField files={files} onChange={setFiles} />
      <ErrorText error={create.error} />
      <Button type="submit" variant="primary" disabled={create.isPending}>
        {submitLabel(create.isPending, created)}
      </Button>
    </form>
  );
}
