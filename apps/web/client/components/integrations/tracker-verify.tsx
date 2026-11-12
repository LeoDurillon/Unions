// The onboarding steps' Verify for a tracker: checks its secret and config, and keeps the normalized config and title.

import { useMutation } from '@tanstack/react-query';
import { integrationKind, type IntegrationKindName } from '@union/core/integration-kinds';
import type { ReactElement } from 'react';

import { integrationsApi } from '../../lib/integrations/integrations-api';
import { trackerSkipped, type StepProps, type TrackerDraft } from '../onboarding/draft';
import { Button, ErrorText } from '../ui/ui';

function trimmed(config: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(config).map(([name, value]) => [name, value.trim()]));
}

/** The config as the server normalized it, keeping only text values. */
function textConfig(config: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(config).flatMap(([name, value]) =>
      typeof value === 'string' ? [[name, value]] : [],
    ),
  );
}

/** Changes a tracker's fields: what was verified no longer holds. */
export function changeTracker(
  { draft, patch }: StepProps,
  kind: IntegrationKindName,
  change: Partial<Omit<TrackerDraft, 'title'>>,
): void {
  patch({
    trackers: { ...draft.trackers, [kind]: { ...draft.trackers[kind], ...change, title: null } },
  });
}

/** Verify, its error, and "Connected to …" once the tracker answered. */
export function TrackerVerify({
  kind,
  props,
  complete,
}: {
  kind: IntegrationKindName;
  props: StepProps;
  /** Every field is filled in. */
  complete: boolean;
}): ReactElement {
  const { draft, patch } = props;
  const tracker = draft.trackers[kind];
  const { sourceLabel } = integrationKind(kind);
  // The fields as sent: an error is shown only while they are still the ones typed.
  const sent = JSON.stringify([tracker.secret, tracker.config]);
  const verify = useMutation({
    mutationFn: (_fields: string) =>
      integrationsApi.verify(kind, tracker.secret.trim(), trimmed(tracker.config)),
    onSuccess: (result) => {
      const title = result.title || `Untitled ${sourceLabel}`;
      const config = textConfig(result.config);
      patch({ trackers: { ...draft.trackers, [kind]: { ...tracker, config, title } } });
    },
  });
  return (
    <>
      <Button
        variant="primary"
        disabled={!complete || trackerSkipped(tracker) || verify.isPending}
        onClick={() => {
          verify.mutate(sent);
        }}
      >
        {verify.isPending ? 'Verifying…' : 'Verify'}
      </Button>
      <ErrorText error={verify.variables === sent ? verify.error : null} />
      {tracker.title ? (
        <p className="text-sm text-green-700 dark:text-green-400">
          Connected to “{tracker.title}”.
        </p>
      ) : null}
    </>
  );
}
