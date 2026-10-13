import { useMutation } from '@tanstack/react-query';
import { useState, type ReactElement } from 'react';

import type { NotionImport } from '../../src/api-types';
import { api } from '../lib/api';
import { Markdown } from './markdown';
import { Button, ErrorText, Field, inputClass } from './ui';

function Preview({
  page,
  creating,
  onCreate,
  onEdit,
}: {
  page: NotionImport;
  creating: boolean;
  onCreate: () => void;
  onEdit: () => void;
}): ReactElement {
  return (
    <div className="space-y-3">
      <div className="max-h-72 space-y-2 overflow-y-auto rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
        <h3 className="font-semibold">{page.title}</h3>
        <Markdown>{page.body}</Markdown>
      </div>
      {page.truncated ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          The page is very long: Notion returned only its first part.
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

function PageInput({
  value,
  pending,
  onChange,
  onFetch,
}: {
  value: string;
  pending: boolean;
  onChange: (value: string) => void;
  onFetch: () => void;
}): ReactElement {
  return (
    <Field
      label="Notion page ID or URL"
      hint="The page must be a row of the project's Notion data source."
    >
      <div className="flex gap-2">
        <input
          className={`${inputClass} font-mono`}
          aria-label="Notion page ID or URL"
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

/** Fetches a page of the project's Notion data source, previews it, and creates the ticket. */
export function NotionImportPanel({
  projectId,
  onCreated,
  onEdit,
}: {
  projectId: number;
  onCreated: (ticketId: number) => void;
  onEdit: (title: string, body: string) => void;
}): ReactElement {
  const [page, setPage] = useState('');
  const fetchPage = useMutation({
    mutationFn: () => api.notion.importPage(projectId, page.trim()),
  });
  const create = useMutation({
    mutationFn: (found: NotionImport) =>
      api.createTicket({
        projectId,
        title: found.title,
        body: found.body,
        notionPageId: found.pageId,
      }),
    onSuccess: (ticket) => {
      onCreated(ticket.id);
    },
  });
  const found = fetchPage.data;

  return (
    <div className="space-y-4">
      <PageInput
        value={page}
        pending={fetchPage.isPending}
        onChange={(value) => {
          setPage(value);
          fetchPage.reset();
        }}
        onFetch={() => {
          fetchPage.mutate();
        }}
      />
      <ErrorText error={fetchPage.error ?? create.error} />
      {found ? (
        <Preview
          page={found}
          creating={create.isPending}
          onCreate={() => {
            create.mutate(found);
          }}
          onEdit={() => {
            onEdit(found.title, found.body);
          }}
        />
      ) : null}
    </div>
  );
}
