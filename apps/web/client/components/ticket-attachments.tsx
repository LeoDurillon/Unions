import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';
import type { Attachment } from '@union/core';
import { useState, type ReactElement } from 'react';

import { attachmentsApi, attachmentUrl } from '../lib/attachments-api';
import { ATTACHMENTS_HINT, FilePicker, FileRow } from './attachments';
import { ErrorText } from './ui';

type Change = Partial<Pick<Attachment, 'note' | 'allowInRepo'>>;

function useAttachmentMutations(ticketId: number): {
  upload: UseMutationResult<void, Error, File[]>;
  update: UseMutationResult<Attachment, Error, { attachment: Attachment; change: Change }>;
  remove: UseMutationResult<unknown, Error, Attachment>;
} {
  const queryClient = useQueryClient();
  const onSettled = (): Promise<void> =>
    queryClient.invalidateQueries({ queryKey: ['ticket', ticketId, 'attachments'] });
  const upload = useMutation({
    mutationFn: (files: File[]) =>
      attachmentsApi.uploadAll(
        ticketId,
        files.map((file) => ({ file, note: '', allowInRepo: false })),
      ),
    onSettled,
  });
  const update = useMutation({
    mutationFn: ({ attachment, change }: { attachment: Attachment; change: Change }) =>
      attachmentsApi.update(attachment, change),
    onSettled,
  });
  const remove = useMutation({
    mutationFn: (attachment: Attachment) => attachmentsApi.remove(attachment),
    onSettled,
  });
  return { upload, update, remove };
}

/** The ticket's files, in its Overview tab: added, described and removed at any time. */
export function TicketAttachments({ ticketId }: { ticketId: number }): ReactElement {
  const query = useQuery({
    queryKey: ['ticket', ticketId, 'attachments'],
    queryFn: () => attachmentsApi.list(ticketId),
  });
  const { upload, update, remove } = useAttachmentMutations(ticketId);
  const [problems, setProblems] = useState<string[]>([]);
  const attachments = query.data ?? [];
  const busy = upload.isPending || update.isPending || remove.isPending;
  return (
    <section className="space-y-2" aria-label="Files">
      <h3 className="text-sm font-medium">Files</h3>
      {attachments.length > 0 ? (
        <ul className="space-y-2">
          {attachments.map((attachment) => (
            <FileRow
              key={attachment.id}
              name={attachment.name}
              href={attachmentUrl(attachment)}
              size={attachment.size}
              note={attachment.note}
              allowInRepo={attachment.allowInRepo}
              disabled={busy}
              onNote={(note) => {
                update.mutate({ attachment, change: { note } });
              }}
              onAllow={(allowInRepo) => {
                update.mutate({ attachment, change: { allowInRepo } });
              }}
              onRemove={() => {
                remove.mutate(attachment);
              }}
            />
          ))}
        </ul>
      ) : null}
      <FilePicker
        label={upload.isPending ? 'Uploading…' : 'Add files'}
        disabled={upload.isPending}
        onFiles={(files, refused) => {
          setProblems(refused);
          if (files.length > 0) {
            upload.mutate(files);
          }
        }}
      />
      {problems.map((problem) => (
        <p key={problem} className="text-sm text-red-600 dark:text-red-400">
          {problem}
        </p>
      ))}
      <ErrorText error={query.error ?? upload.error ?? update.error ?? remove.error} />
      <p className="text-xs text-zinc-500">
        {ATTACHMENTS_HINT} Files added or changed here reach the agents at the next step.
      </p>
    </section>
  );
}
