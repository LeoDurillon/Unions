// The actions the rule editor offers: those of the trackers and GitHub layers the project has, and Union's.

import { useQuery } from '@tanstack/react-query';
import {
  actionChoices,
  choiceKey,
  COMMENT_TARGETS,
  type ActionChoice,
  type CommentTarget,
} from '@union/core/event-actions';
import type { IntegrationKindName } from '@union/core/integration-kinds';

import type { EventRulesResponse } from '../../../src/event-api-types';
import { eventRulesApi } from './event-rules-api';

/** What an action can need: a tracker, or the GitHub Project (not a row of `integrations`). */
export type Connection = IntegrationKindName | 'github-project';

function neededBy(choice: ActionChoice): Connection | null {
  return choice.kind === 'github_project_fields' ? 'github-project' : choice.tracker;
}

/**
 * The choices to offer: a tracker's only when the project is connected to it, the Project fields'
 * only with a GitHub Project. The rule's own choice stays, so editing a rule of something since
 * disconnected does not change what it does.
 */
export function offeredActionChoices(
  connected: ReadonlySet<Connection>,
  current: ActionChoice,
): ActionChoice[] {
  return actionChoices().filter((choice) => {
    const needed = neededBy(choice);
    return needed === null || connected.has(needed) || choiceKey(choice) === choiceKey(current);
  });
}

/**
 * Commenting on the issue only for a project that mirrors tickets as issues, or a saved rule that
 * already does. A comment with no text yet is a new one: it is not kept on the issue.
 */
export function offeredCommentTargets(
  issues: boolean,
  current: { on: CommentTarget; body: string },
): CommentTarget[] {
  const kept = current.body.trim() !== '' && current.on === 'issue';
  return COMMENT_TARGETS.filter((target) => issues || target !== 'issue' || kept);
}

function connectionsOf(data: EventRulesResponse | undefined): Set<Connection> {
  const connected = new Set<Connection>();
  for (const { kind } of data?.trackers ?? []) {
    connected.add(kind);
  }
  if (data?.github.project) {
    connected.add('github-project');
  }
  return connected;
}

/** The rules list the Events page reads: what the project is connected to. */
function useRulesSource(projectId: number): EventRulesResponse | undefined {
  return useQuery({
    queryKey: ['event-rules', projectId],
    queryFn: () => eventRulesApi.list(projectId),
  }).data;
}

/** The choices to offer for the project (only those needing nothing until the rules list loads). */
export function useOfferedActionChoices(projectId: number, current: ActionChoice): ActionChoice[] {
  return offeredActionChoices(connectionsOf(useRulesSource(projectId)), current);
}

/** Where a GitHub comment can go for the project (both until the rules list loads). */
export function useOfferedCommentTargets(
  projectId: number,
  current: { on: CommentTarget; body: string },
): CommentTarget[] {
  return offeredCommentTargets(useRulesSource(projectId)?.github.issues ?? true, current);
}
