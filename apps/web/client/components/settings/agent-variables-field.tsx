// Which of the preview's plain variables the agent's commands get (and the commands the user runs):
// a preview's database address would otherwise win over the one the tests' env file names.
import type { AgentVariables } from '@union/core/preview';
import type { ReactElement } from 'react';

import { parseEnvLines } from '../../lib/env-lines';
import { CheckChip, ChipGroup, Segmented, Switch, toggled, type SegmentOption } from '../choice';
import type { Form } from './preview-form';

const MODES: SegmentOption<AgentVariables['mode']>[] = [
  { value: 'all', label: 'All plain variables' },
  { value: 'none', label: 'None', title: "The repository's env files apply" },
  { value: 'chosen', label: 'Only these' },
];

function ChosenNames({
  chosen,
  names,
  onChange,
}: {
  chosen: string[];
  names: string[];
  onChange: (value: AgentVariables) => void;
}): ReactElement {
  if (names.length === 0) {
    return <p className="text-xs text-zinc-500">No plain variable yet (Previews → Variables).</p>;
  }
  return (
    <ChipGroup>
      {names.map((name) => (
        <CheckChip
          key={name}
          mono
          checked={chosen.includes(name)}
          onChange={(on) => {
            onChange({ mode: 'chosen', names: toggled(chosen, name, on) });
          }}
        >
          {name}
        </CheckChip>
      ))}
    </ChipGroup>
  );
}

/**
 * Which of the preview's plain variables the agent's commands get (and the commands the user runs):
 * a preview's database address would otherwise win over the one the tests' env file names.
 */
function AgentVariablesField({
  value,
  names,
  onChange,
}: {
  value: AgentVariables;
  /** The plain variables, as the Variables page holds them. */
  names: string[];
  onChange: (value: AgentVariables) => void;
}): ReactElement {
  const chosen = value.names ?? [];
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Variables for the agent&apos;s commands</legend>
      <p className="text-xs text-zinc-500">
        Variables already set win over the repository&apos;s env files (<code>.env.test</code>):
        give none, or only some, so the tests use their own database. Secrets are never given.
      </p>
      <Segmented
        legend="Variables for the agent's commands"
        options={MODES}
        value={value.mode}
        onChange={(mode) => {
          onChange(mode === 'chosen' ? { mode, names: chosen } : { mode });
        }}
      />
      {value.mode === 'chosen' ? (
        <ChosenNames chosen={chosen} names={names} onChange={onChange} />
      ) : null}
    </fieldset>
  );
}

/** Whether the agent services' published ports reach the agent's `localhost`. */
function ForwardPortsField({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
}): ReactElement {
  return (
    <div className="space-y-1">
      <Switch checked={value} onChange={onChange}>
        <span className="font-medium">Reach them on localhost</span>
      </Switch>
      <p className="text-xs text-zinc-500">
        The ports these services publish in the compose file (<code>5432:5432</code>) answer on{' '}
        <code>localhost</code> in the ticket&apos;s environment, as on a developer&apos;s machine.
        Turn it off when the repository&apos;s settings already use the services&apos; names (
        <code>db:5432</code>); they are reachable by name either way.
      </p>
    </div>
  );
}

/** For the agent services: whether they answer on localhost, and the variables the agent gets. */
export function AgentEnvironment({
  form,
  onChange,
}: {
  form: Form;
  onChange: (form: Form) => void;
}): ReactElement {
  return (
    <>
      <ForwardPortsField
        value={form.forwardPorts}
        onChange={(forwardPorts) => {
          onChange({ ...form, forwardPorts });
        }}
      />
      <AgentVariablesField
        value={form.agentVariables}
        names={Object.keys(parseEnvLines(form.env))}
        onChange={(agentVariables) => {
          onChange({ ...form, agentVariables });
        }}
      />
    </>
  );
}
