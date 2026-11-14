// The dialog opened from the project bar: New ticket.

import { useState, type ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import type { Overlay } from '../../lib/app/use-navigation';
import { TicketBody } from '../new-ticket/ticket-body';
import type { TicketText } from '../new-ticket/ticket-form';
import { Dialog } from '../ui/dialog';

const EMPTY: TicketText = { title: '', body: '' };

/** Keeps what was typed per project while the dialog is closed, until the ticket is created. */
function TicketDialog({
  open,
  project,
  onClose,
  onCreated,
}: {
  open: boolean;
  project: PublicProject | null;
  onClose: () => void;
  onCreated: (id: number) => void;
}): ReactElement {
  const [texts, setTexts] = useState<Record<number, TicketText>>({});
  const keep = (projectId: number, text: TicketText): void => {
    setTexts((previous) => ({ ...previous, [projectId]: text }));
  };
  return (
    <Dialog open={open && project !== null} onClose={onClose} title="New ticket">
      {project ? (
        <TicketBody
          project={project}
          text={texts[project.id] ?? EMPTY}
          onText={(text) => {
            keep(project.id, text);
          }}
          onCreated={(id) => {
            keep(project.id, EMPTY);
            onCreated(id);
          }}
          onCancel={onClose}
        />
      ) : null}
    </Dialog>
  );
}

/** The dialog opened from the project bar: New ticket. */
export function AppDialogs({
  overlay,
  project,
  onClose,
  onTicketCreated,
}: {
  overlay: Overlay;
  project: PublicProject | null;
  onClose: () => void;
  onTicketCreated: (id: number) => void;
}): ReactElement {
  return (
    <TicketDialog
      open={overlay === 'ticket'}
      project={project}
      onClose={onClose}
      onCreated={onTicketCreated}
    />
  );
}
