// Writes the tickets asked from investigations, each in a throwaway container removed afterwards.
import {
  claimTicketDraft,
  failInterruptedTicketDrafts,
  FetchNotionApi,
  finishTicketDraft,
  schema,
  type DraftedTicket,
  type Investigation,
  type Project,
  type TicketDraft,
} from '@union/core';
import { eq } from 'drizzle-orm';

import { runAgent } from './agent';
import type { InvestigationDeps } from './investigate';
import { withTargetItem } from './investigation-ticket-target';
import type { TicketContainer } from './provision';
import { RunPool } from './run-pool';
import { inThrowaway, removeThrowaway } from './throwaway-container';

type DraftOutcome = DraftedTicket | { error: string };

/** The ticket is written from the conversation alone: no repository, no tools. */
const WORKDIR = '/workspace';
const MAX_TITLE = 200;

function ticketDraftContainer(id: number): TicketContainer {
  return {
    name: `union-i${id}-ticket`,
    homeVolume: `union-i${id}-ticket-home`,
    workspaceVolume: `union-i${id}-ticket-ws`,
  };
}

function conversation(investigation: Investigation): string {
  const exchanges = [
    ...investigation.history,
    { prompt: investigation.prompt, answer: investigation.result ?? '' },
  ];
  return exchanges
    .map(
      ({ prompt, answer }) => `<question>\n${prompt}\n</question>\n<answer>\n${answer}\n</answer>`,
    )
    .join('\n\n');
}

/** Everything the investigation found, what the user wants the ticket to cover, and the format. */
export function ticketPrompt(investigation: Investigation, project: Project): string {
  const context = investigation.ticketContext?.trim() ?? '';
  const cover =
    context === '' ? 'Everything the investigation found that calls for a change.' : context;
  return `You write a ticket for the team working on ${project.owner}/${project.repo}, from an investigation they ran: "${investigation.title}".

# The investigation (questions and answers, oldest first)

${conversation(investigation)}

# What the ticket must cover

${cover}

Language: write the whole ticket in the language of the user's questions above (English questions give an English ticket). Ignore the language of the answers, the code or the project's name.
The first line is \`# \` then a short title in the imperative (under 80 characters).
Then the description in markdown: the problem and why it matters, what to change, acceptance criteria as a checklist, and the findings from the investigation the implementer needs (files, links).
Output only the ticket.`;
}

/** Title from the first heading (else the first line), the rest as the body. */
export function parseTicketDraft(text: string, investigation: Investigation): TicketDraft {
  const lines = text.trim().split('\n');
  const first = lines.findIndex((line) => line.trim() !== '');
  const heading = first === -1 ? '' : (lines[first] ?? '').replace(/^#+\s*/u, '').trim();
  const body = lines
    .slice(first + 1)
    .join('\n')
    .trim();
  const footer = `---\nWritten from the investigation "${investigation.title}".`;
  return {
    title: (heading === '' ? investigation.title : heading).slice(0, MAX_TITLE),
    body: body === '' ? footer : `${body}\n\n${footer}`,
  };
}

function draftTicket(deps: InvestigationDeps, investigation: Investigation): Promise<DraftOutcome> {
  const { db, runtime } = deps;
  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, investigation.projectId))
    .get();
  if (!project) {
    return Promise.resolve({ error: `Project ${investigation.projectId} not found` });
  }
  const names = ticketDraftContainer(investigation.id);
  return inThrowaway(
    deps,
    names,
    async (container): Promise<DraftOutcome> => {
      const outcome = await (deps.agent ?? runAgent)(runtime, {
        container,
        cwd: WORKDIR,
        model: investigation.model,
        prompt: ticketPrompt(investigation, project),
        tools: [],
        onEvent: () => {
          // Not logged: the investigation's Log tab is for its own runs.
        },
      });
      if (outcome.kind !== 'ok') {
        return { error: outcome.message };
      }
      const draft = parseTicketDraft(outcome.text, investigation);
      return withTargetItem(deps.db, deps.notion ?? new FetchNotionApi(), investigation, draft);
    },
    investigation.id,
  );
}

/**
 * Writes the tickets asked from investigations, each in a throwaway container removed afterwards,
 * sharing the run slots with the rest. Driven by the `InvestigationRunner`.
 */
export class TicketDrafter extends RunPool<Investigation, DraftOutcome> {
  constructor(private readonly deps: InvestigationDeps) {
    super({
      slots: deps.slots,
      claim: () => claimTicketDraft(deps.db),
      run: (investigation) => draftTicket(deps, investigation),
      failed: (error) => ({ error }),
      finish: (investigation, outcome) => {
        finishTicketDraft(deps.db, investigation.id, outcome);
      },
    });
  }

  async recover(): Promise<void> {
    for (const id of failInterruptedTicketDrafts(this.deps.db)) {
      await removeThrowaway(this.deps, ticketDraftContainer(id), id);
    }
  }
}
