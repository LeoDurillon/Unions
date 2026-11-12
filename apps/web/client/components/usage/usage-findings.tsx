// A project's findings on its Usage tab: what its agents' calls and tool uses show to improve. Each
// comes with the tickets that show it.
import type { Finding, FindingItem, ProjectFindings } from '@union/core';
import { stepTextTitle } from '@union/core/step-titles';
import type { ReactElement, ReactNode } from 'react';

import { FINDING_TEXTS } from '../../lib/finding-text';
import { useCustomAgentNames } from '../../lib/use-custom-agents';
import { Badge } from '../ui';

type Open = (id: number) => void;

function TicketLink({
  id,
  findings,
  onOpen,
}: {
  id: number;
  findings: ProjectFindings;
  onOpen: Open;
}): ReactElement {
  const ticket = findings.tickets[id];
  const name = ticket
    ? `${ticket.issueNumber === null ? '' : `#${ticket.issueNumber} `}${ticket.title}`
    : `Ticket ${id}`;
  return (
    <button
      type="button"
      title={name}
      onClick={() => {
        onOpen(id);
      }}
      className="max-w-60 truncate text-left text-indigo-600 hover:underline dark:text-indigo-400"
    >
      {name}
    </button>
  );
}

function Item({
  finding,
  item,
  findings,
  onOpen,
}: {
  finding: Finding;
  item: FindingItem;
  findings: ProjectFindings;
  onOpen: Open;
}): ReactElement {
  const text = FINDING_TEXTS[finding.kind];
  const names = useCustomAgentNames();
  const [first] = item.tickets;
  const label = finding.kind === 'large_sessions' ? stepTextTitle(item.label, names) : item.label;
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 border-t border-zinc-200 py-1 dark:border-zinc-800">
      {text.isTicket && first !== undefined ? (
        <TicketLink id={first} findings={findings} onOpen={onOpen} />
      ) : (
        <code className="max-w-full truncate text-xs" title={label}>
          {label}
        </code>
      )}
      <span className="text-zinc-500 tabular-nums">{text.figure(item)}</span>
      {text.isTicket || item.tickets.length === 0 ? null : (
        <span className="flex min-w-0 flex-wrap gap-x-2 text-zinc-500">
          seen most in
          {item.tickets.map((id) => (
            <TicketLink key={id} id={id} findings={findings} onOpen={onOpen} />
          ))}
        </span>
      )}
    </li>
  );
}

function FindingCard({
  finding,
  findings,
  onOpen,
}: {
  finding: Finding;
  findings: ProjectFindings;
  onOpen: Open;
}): ReactElement {
  const text = FINDING_TEXTS[finding.kind];
  return (
    <article className="space-y-2 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <header className="flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-semibold">{text.title}</h4>
        <Badge tone={finding.actor === 'union' ? 'blue' : 'amber'}>
          {finding.actor === 'union' ? 'Union' : 'Repository'}
        </Badge>
      </header>
      <p className="text-xs text-zinc-600 dark:text-zinc-400">{text.advice}</p>
      <ul className="text-xs">
        {finding.items.map((item) => (
          <Item
            key={`${item.label}-${item.tickets.join(',')}`}
            finding={finding}
            item={item}
            findings={findings}
            onOpen={onOpen}
          />
        ))}
      </ul>
    </article>
  );
}

export function UsageFindings({
  findings,
  action,
  onOpenTicket,
}: {
  findings: ProjectFindings;
  /** Shown beside the title when something stands out. */
  action: ReactNode;
  onOpenTicket: Open;
}): ReactElement {
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="sr-only">What to improve</h3>
          <p className="text-xs text-zinc-500">
            Read from the agents&apos; logs over this range. “Repository” is for the project&apos;s
            code and docs (CLAUDE.md, scripts, skills); “Union” is for how Union runs the agents.
          </p>
        </div>
        {findings.findings.length === 0 ? null : action}
      </div>
      {findings.findings.length === 0 ? (
        <p className="text-sm text-zinc-500">Nothing stands out in this range.</p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {findings.findings.map((finding) => (
            <FindingCard
              key={finding.kind}
              finding={finding}
              findings={findings}
              onOpen={onOpenTicket}
            />
          ))}
        </div>
      )}
    </section>
  );
}
