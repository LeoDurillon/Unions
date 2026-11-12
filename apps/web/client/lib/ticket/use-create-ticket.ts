// Creating a ticket from the New ticket form, then uploading its files one by one.

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import type { TicketOrigin } from '@union/core';
import type { PipelineStep } from '@union/core/states';
import { useState } from 'react';

import { api } from '../app/api';
import { attachmentsApi, type PendingFile } from './attachments-api';

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

export type NewTicket = {
  projectId: number;
  title: string;
  body: string;
  parentId: number | null;
  flow: PipelineStep[] | null;
  origin?: TicketOrigin;
};

export /** Creates the ticket, then uploads its files; a retry after a failed upload reuses the ticket. */
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
