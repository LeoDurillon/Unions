// A pull request action's fields: the changes it makes, one box each, and adding the kinds not used yet.
import { useQuery } from '@tanstack/react-query';
import type { GitHubPullRequestAction } from '@union/core/event-actions';
import {
  emptyChange,
  isPullRequestChangeKind,
  PULL_REQUEST_CHANGE_KINDS,
  PULL_REQUEST_CHANGE_LABELS,
  type PullRequestChange,
  type PullRequestChangeKind,
} from '@union/core/event-pull-request';
import type { ReactElement } from 'react';

import type { RuleChoices } from '../../../src/event-api-types';
import { eventRulesApi } from '../../lib/event-rules-api';
import { Button, inputClass } from '../ui';
import { PullRequestChangeFields } from './pull-request-change';

const NO_CHOICES: RuleChoices = { labels: [], users: [] };

function ChangeBox({
  change,
  choices,
  onChange,
  onRemove,
}: {
  change: PullRequestChange;
  choices: RuleChoices;
  onChange: (change: PullRequestChange) => void;
  onRemove: () => void;
}): ReactElement {
  return (
    <div className="space-y-2 rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{PULL_REQUEST_CHANGE_LABELS[change.kind]}</span>
        <Button aria-label={`Remove ${PULL_REQUEST_CHANGE_LABELS[change.kind]}`} onClick={onRemove}>
          Remove
        </Button>
      </div>
      <PullRequestChangeFields change={change} choices={choices} onChange={onChange} />
    </div>
  );
}

/** Adds a change of a kind the action does not make yet. */
function AddChange({
  unused,
  onAdd,
}: {
  unused: PullRequestChangeKind[];
  onAdd: (change: PullRequestChange) => void;
}): ReactElement | null {
  if (unused.length === 0) {
    return null;
  }
  return (
    <select
      aria-label="Add a change"
      className={inputClass}
      value=""
      onChange={(event) => {
        const kind = event.target.value;
        if (isPullRequestChangeKind(kind)) {
          onAdd(emptyChange(kind));
        }
      }}
    >
      <option value="">Add a change…</option>
      {unused.map((kind) => (
        <option key={kind} value={kind}>
          {PULL_REQUEST_CHANGE_LABELS[kind]}
        </option>
      ))}
    </select>
  );
}

export function PullRequestFields({
  projectId,
  action,
  onChange,
}: {
  projectId: number;
  action: GitHubPullRequestAction;
  onChange: (action: GitHubPullRequestAction) => void;
}): ReactElement {
  const choices = useQuery({
    queryKey: ['rule-choices', projectId],
    queryFn: () => eventRulesApi.ruleChoices(projectId),
  });
  const unused = PULL_REQUEST_CHANGE_KINDS.filter(
    (kind) => !action.changes.some((change) => change.kind === kind),
  );
  const update = (changes: PullRequestChange[]): void => {
    onChange({ ...action, changes });
  };
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">
        What changes on the ticket&apos;s pull request
      </legend>
      {choices.isError ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Could not read the labels and users from GitHub: type them.
        </p>
      ) : null}
      {action.changes.map((change) => (
        <ChangeBox
          key={change.kind}
          change={change}
          choices={choices.data ?? NO_CHOICES}
          onChange={(next) => {
            update(action.changes.map((other) => (other.kind === next.kind ? next : other)));
          }}
          onRemove={() => {
            update(action.changes.filter((other) => other.kind !== change.kind));
          }}
        />
      ))}
      <AddChange
        unused={unused}
        onAdd={(change) => {
          update([...action.changes, change]);
        }}
      />
    </fieldset>
  );
}
