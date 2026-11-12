// The form that creates a ticket, with its parent and attached files.

import type { TicketOrigin } from '@union/core';
import { integrationKind } from '@union/core/integration-kinds';
import type { PipelineStep } from '@union/core/states';
import { useState, type ReactElement, type ReactNode, type SubmitEvent } from 'react';

import type { PendingFile } from '../../lib/ticket/attachments-api';
import { useCreateTicket } from '../../lib/ticket/use-create-ticket';
import { ErrorText, inputClass } from '../ui/ui';
import { DescriptionField } from './description-field';
import { FormFooter, submitOnModEnter } from './form-footer';
import { ParentField } from './parent-field';

/** A tracker item (a Notion page) whose import is edited before the ticket is created. */
export type SourceRef = TicketOrigin & { title: string };

/** The ticket stays linked to the item (and gets its images) unless unlinked here. */
function SourceLink({ item, onUnlink }: { item: SourceRef; onUnlink: () => void }): ReactElement {
  return (
    <p className="flex items-center gap-2 text-xs text-zinc-500">
      <span>
        Imported from {integrationKind(item.kind).label}:{' '}
        <span className="font-medium">{item.title}</span>
      </span>
      <button type="button" className="underline hover:text-zinc-700" onClick={onUnlink}>
        Unlink
      </button>
    </p>
  );
}

function TitleInput({
  title,
  onTitle,
}: {
  title: string;
  onTitle: (title: string) => void;
}): ReactElement {
  return (
    <input
      aria-label="Title"
      className={`${inputClass} py-2 text-[15px] font-semibold`}
      placeholder="What should change, in a line"
      value={title}
      onKeyDown={submitOnModEnter}
      onChange={(event) => {
        onTitle(event.target.value);
      }}
      required
    />
  );
}

export function TicketForm({
  projectId,
  flow,
  onCreated,
  onCancel,
  initialTitle = '',
  initialBody = '',
  source = null,
  flowField = null,
}: {
  projectId: number;
  /** Chosen in `flowField`, shared with the other ways of creating the ticket. */
  flow: PipelineStep[] | null;
  /** The flow picker, shown after the description. */
  flowField?: ReactNode;
  onCreated: (ticketId: number) => void;
  onCancel: () => void;
  initialTitle?: string;
  initialBody?: string;
  source?: SourceRef | null;
}): ReactElement {
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [parentId, setParentId] = useState<number | null>(null);
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [linked, setLinked] = useState(source);
  const origin = linked ? { kind: linked.kind, id: linked.id, url: linked.url } : null;
  const { create, created } = useCreateTicket(
    { projectId, title, body, parentId, flow, ...(origin ? { origin } : {}) },
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
        <SourceLink
          item={linked}
          onUnlink={() => {
            setLinked(null);
          }}
        />
      ) : null}
      <TitleInput title={title} onTitle={setTitle} />
      <DescriptionField body={body} onBody={setBody} files={files} onFiles={setFiles} />
      {flowField}
      <ParentField projectId={projectId} value={parentId} onChange={setParentId} />
      <ErrorText error={create.error} />
      <FormFooter pending={create.isPending} created={created} onCancel={onCancel} />
    </form>
  );
}
