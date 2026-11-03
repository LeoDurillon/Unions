// Where a new custom agent runs, chosen once: a step of ticket flows, or a review agent run from a review page.
import type { CustomAgentKind } from '@union/core';
import type { ReactElement } from 'react';

const CHOICE_ON = 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40';
const CHOICE_OFF = 'border-zinc-200 hover:border-zinc-400 dark:border-zinc-800';

export const KIND_TEXTS: Record<
  CustomAgentKind,
  { label: string; what: string; intro: string; placeholder: string }
> = {
  step: {
    label: 'Ticket step',
    what: "Runs in a project's flow, before or after the implementation, and writes a report you approve.",
    intro:
      "Say what the agent should do. Union writes its prompt from this, in the style of the built-in agents; you review it on its page, then add the agent to a project's flows.",
    placeholder:
      'Check the plan for security risks: auth, input validation, secrets, data exposure.',
  },
  review: {
    label: 'Review agent',
    what: "Runs when you ask, from a review page, on a pull request or a ticket's branch. It may build and test a copy of the change.",
    intro:
      'Say what the agent should check. Union writes its prompt from this; you review it on its page, then run the agent from Run agent on any review page.',
    placeholder:
      'Say whether this can be merged: run the build, the types, the lint and the tests, compare it with the ADRs, and list what must change first.',
  },
};

const KINDS: readonly CustomAgentKind[] = ['step', 'review'];

/** The two kinds as cards; the kind cannot change once the agent is created. */
export function AgentKindField({
  value,
  onChange,
}: {
  value: CustomAgentKind;
  onChange: (kind: CustomAgentKind) => void;
}): ReactElement {
  return (
    <fieldset className="space-y-1">
      <legend className="text-sm font-medium">Kind</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {KINDS.map((kind) => (
          <label
            key={kind}
            className={`relative cursor-pointer rounded-lg border p-3 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-indigo-500 ${value === kind ? CHOICE_ON : CHOICE_OFF}`}
          >
            <input
              type="radio"
              name="custom-agent-kind"
              className="sr-only"
              checked={value === kind}
              onChange={() => {
                onChange(kind);
              }}
            />
            <span className="block text-sm font-medium">{KIND_TEXTS[kind].label}</span>
            <span className="block text-xs text-zinc-500">{KIND_TEXTS[kind].what}</span>
          </label>
        ))}
      </div>
      <p className="text-xs text-zinc-500">It cannot be changed later.</p>
    </fieldset>
  );
}
