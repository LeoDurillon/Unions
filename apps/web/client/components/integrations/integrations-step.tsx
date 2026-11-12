// The setup wizard's Integrations step: a selector between the GitHub Project and the trackers
// (Notion, Jira). Below it, the chosen one's form.
import { integrationKind, type IntegrationKindName } from '@union/core/integration-kinds';
import { useState, type ReactElement } from 'react';

import { Segmented } from '../choice';
import { projectSettled, trackerKinds, trackerSettled, type StepProps } from '../onboarding/draft';
import { ProjectStep } from '../onboarding/project-step';
import { JiraStep } from './jira/jira-step';
import { NotionStep } from './notion/notion-step';

type Shown = IntegrationKindName | 'github-project';

const FORMS: Record<Shown, (props: StepProps) => ReactElement> = {
  'github-project': ProjectStep,
  notion: NotionStep,
  jira: JiraStep,
};

/** A tracker left filled in but not verified holds the wizard back: says which, when it is not shown. */
function Unsettled({ props, shown }: { props: StepProps; shown: Shown }): ReactElement | null {
  const waiting = trackerKinds(props.draft).filter(
    (kind) => kind !== shown && !trackerSettled(props.draft, kind),
  );
  const board = shown !== 'github-project' && !projectSettled(props.draft);
  if (waiting.length === 0 && !board) {
    return null;
  }
  const labels = waiting.map((kind) => integrationKind(kind).label).join(' and ');
  return (
    <p className="text-xs text-amber-700 dark:text-amber-400">
      {labels === ''
        ? ''
        : `${labels} is filled in but not verified: verify it, or empty its fields to skip it. `}
      {board
        ? 'The GitHub Project choice is not complete: finish it, or pick No GitHub Project.'
        : ''}
    </p>
  );
}

export function IntegrationsStep(props: StepProps): ReactElement {
  const [shown, setShown] = useState<Shown>('github-project');
  const options: { value: Shown; label: string }[] = [
    { value: 'github-project', label: `GitHub Project${props.draft.project === null ? '' : ' ✓'}` },
    ...trackerKinds(props.draft).map((kind) => ({
      value: kind,
      label: `${integrationKind(kind).label}${props.draft.trackers[kind].title === null ? '' : ' ✓'}`,
    })),
  ];
  const Form = FORMS[shown];
  return (
    <div className="space-y-4">
      <Segmented
        legend="The integration to set up"
        size="sm"
        options={options}
        value={shown}
        onChange={setShown}
      />
      <Form {...props} />
      <Unsettled props={props} shown={shown} />
    </div>
  );
}
