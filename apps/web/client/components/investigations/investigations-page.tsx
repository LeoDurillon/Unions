// Ad-hoc agent runs on a custom prompt for the project; no GitHub issue is created. Opens on the latest one.
import { useQuery } from '@tanstack/react-query';
import type { Investigation } from '@union/core';
import { useState, type ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { api } from '../../lib/api';
import { clearInvestigateTicket } from '../../lib/investigate-ticket';
import { InvestigationDetail } from './investigation-detail';
import { InvestigationForm } from './investigation-form';
import { InvestigationList } from './investigation-list';

/** An investigation's id, the form (`new`), or null: the latest one (the form while there is none). */
type Selection = number | 'new' | null;

function shownOf(investigations: Investigation[], selection: Selection): Investigation | undefined {
  if (selection === 'new') {
    return undefined;
  }
  if (selection === null) {
    return investigations[0];
  }
  return investigations.find((investigation) => investigation.id === selection);
}

/** The form; once created, it opens the new investigation (and forgets the ticket it was asked from). */
function NewInvestigation({
  project,
  initialTicket,
  onCreated,
}: {
  project: PublicProject;
  initialTicket: number | null;
  onCreated: (id: number) => void;
}): ReactElement {
  return (
    <div className="mx-auto max-w-3xl p-6">
      <InvestigationForm
        project={project}
        initialTicket={initialTicket}
        onCreated={(id) => {
          if (initialTicket !== null) {
            clearInvestigateTicket();
          }
          onCreated(id);
        }}
      />
    </div>
  );
}

/** Ad-hoc agent runs on a custom prompt for the project; no GitHub issue is created. */
export function InvestigationsPage({
  project,
  initialTicket = null,
  initialInvestigation = null,
  onOpenTicket,
}: {
  project: PublicProject;
  /** Asked from a ticket: the new investigation's form runs on it. */
  initialTicket?: number | null;
  /** Opened from a notification: shown first. */
  initialInvestigation?: number | null;
  onOpenTicket: (id: number) => void;
}): ReactElement {
  const query = useQuery({
    queryKey: ['investigations', project.id],
    queryFn: () => api.investigations(project.id),
  });
  const [selection, setSelection] = useState<Selection>(
    initialInvestigation ?? (initialTicket === null ? null : 'new'),
  );
  const investigations = query.data ?? [];
  const shown = shownOf(investigations, selection);
  return (
    <div className="flex h-full min-h-0">
      <InvestigationList
        investigations={investigations}
        error={query.error}
        loaded={query.isSuccess}
        selectedId={shown?.id ?? null}
        onSelect={setSelection}
        onNew={() => {
          setSelection('new');
        }}
      />
      <div className="min-w-0 flex-1 overflow-y-auto">
        {shown ? (
          <InvestigationDetail
            key={`${shown.id}-${shown.status}`}
            investigation={shown}
            project={project}
            onDeleted={() => {
              setSelection(null);
            }}
            onOpenTicket={onOpenTicket}
          />
        ) : null}
        {!shown && (query.isSuccess || selection === 'new') ? (
          <NewInvestigation
            project={project}
            initialTicket={initialTicket}
            onCreated={setSelection}
          />
        ) : null}
      </div>
    </div>
  );
}
