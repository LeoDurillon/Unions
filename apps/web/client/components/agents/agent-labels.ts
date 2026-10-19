// The titles and descriptions the agents page shows for each agent, model and effort level.
import type { AgentConfig, AgentEffort, AgentModel, BuiltInAgentId } from '@union/core';

type AgentLabel = { title: string; description: string };

export const AGENT_LABELS: Record<BuiltInAgentId, AgentLabel> = {
  shared: {
    title: 'Shared instructions',
    description: 'Sent first to every agent, before the task and the step instructions.',
  },
  intake: {
    title: 'Intake',
    description:
      'Rewrites the ticket and asks technical questions. Keep the "Answer:" lines: they become input boxes.',
  },
  summary: {
    title: 'Summary',
    description: 'Writes the full task summary from the intake and your answers.',
  },
  technical: {
    title: 'Technical',
    description: 'Proposes the implementation: files, data model, API, steps, risks.',
  },
  test_plan: {
    title: 'Test plan',
    description: 'Lists the tests to write, one per distinct state.',
  },
  implement: {
    title: 'Implementation',
    description: 'Writes the code and the planned tests, runs the checks, commits locally.',
  },
  final_review: {
    title: 'Final review',
    description: 'Reviews the diff against the plan and gives a verdict before you approve.',
  },
  review_comments: {
    title: 'Review comments',
    description:
      'Leaves line comments on a change when you click "Review with agent" in a review. They arrive as drafts you keep, edit or delete before sending.',
  },
  review_groups: {
    title: 'Group by spec',
    description:
      "Groups a review's changed files by the parts of a specification they implement, on request from the review page.",
  },
  review_explain: {
    title: 'Explain',
    description:
      'Explains the lines you select in a review when you click "Explain": how they work, the parts of the specs they implement and the docs they relate to.',
  },
  pr_description: {
    title: 'PR description',
    description:
      'Writes the pull request description when the PR is opened, and rewrites it when you click "Rewrite description" in the PR tab. It resumes the implementation session and fills in the repository\'s PR template.',
  },
  rebase: {
    title: 'Rebase',
    description:
      "Prompt the implementation agent gets when you click Rebase in a ticket's PR tab. It resumes its own session and uses the Implementation model and effort.",
  },
  lesson_writer: {
    title: 'Lesson writer',
    description:
      "Proposes lessons from the feedback when you click Suggest lessons on a project's Memory page. It reads only the feedback and the lessons already kept (no repository, no tools); you accept or drop each proposal.",
  },
  simplify: {
    title: 'Simplify history',
    description:
      "Prompt the implementation agent gets when you click Simplify history in a ticket's PR tab: it rewrites the branch's commits, the code unchanged. It resumes its own session and uses the Implementation model and effort.",
  },
};

/** Whether `value` names a built-in agent; the labels list every one (the record's type holds them to it). */
export function isAgentId(value: string): value is BuiltInAgentId {
  return Object.hasOwn(AGENT_LABELS, value);
}

const CUSTOM_DESCRIPTION =
  "Your own agent: it runs where a project's flow places it, writes a markdown report you approve or send back, and changes no file. Edits apply to its next run, on tickets already running too.";

/** A built-in agent's label; a custom agent is shown by its name. */
export function agentLabel(config: Pick<AgentConfig, 'agent' | 'custom'>): AgentLabel {
  if (config.custom) {
    return { title: config.custom.name, description: CUSTOM_DESCRIPTION };
  }
  return isAgentId(config.agent)
    ? AGENT_LABELS[config.agent]
    : { title: config.agent, description: '' };
}

export const MODEL_LABELS: Record<AgentModel, string> = {
  haiku: 'Haiku (fastest)',
  sonnet: 'Sonnet (balanced)',
  opus: 'Opus (most capable)',
};

export const EFFORT_LABELS: Record<AgentEffort, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra high',
  max: 'Max',
};
