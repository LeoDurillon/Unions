// The setup wizard's Integrations step: a selector between the trackers (Notion, Jira), and the chosen one's form.
import { integrationKind, type IntegrationKindName } from '@union/core/integration-kinds';
import { useState, type ReactElement } from 'react';

import { Segmented } from '../choice';
import { trackerKinds, trackerSettled, type StepProps } from '../onboarding/draft';
import { JiraStep } from './jira/jira-step';
import { NotionStep } from './notion/notion-step';

const FORMS: Record<IntegrationKindName, (props: StepProps) => ReactElement> = {
  notion: NotionStep,
  jira: JiraStep,
};

/** A tracker left filled in but not verified holds the wizard back: says which, when it is not shown. */
function Unsettled({
  props,
  shown,
}: {
  props: StepProps;
  shown: IntegrationKindName;
}): ReactElement | null {
  const waiting = trackerKinds(props.draft).filter(
    (kind) => kind !== shown && !trackerSettled(props.draft, kind),
  );
  if (waiting.length === 0) {
    return null;
  }
  const labels = waiting.map((kind) => integrationKind(kind).label).join(' and ');
  return (
    <p className="text-xs text-amber-700 dark:text-amber-400">
      {labels} is filled in but not verified: verify it, or empty its fields to skip it.
    </p>
  );
}

export function IntegrationsStep(props: StepProps): ReactElement {
  const [shown, setShown] = useState<IntegrationKindName>('notion');
  const options = trackerKinds(props.draft).map((kind) => ({
    value: kind,
    label: `${integrationKind(kind).label}${props.draft.trackers[kind].title === null ? '' : ' ✓'}`,
  }));
  const Form = FORMS[shown];
  return (
    <div className="space-y-4">
      <Segmented
        legend="The tracker to set up"
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
