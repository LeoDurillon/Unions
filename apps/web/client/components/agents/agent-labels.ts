import type { AgentEffort, AgentId, AgentModel } from '@union/core';

export const AGENT_LABELS: Record<AgentId, { title: string; description: string }> = {
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
  rebase: {
    title: 'Rebase',
    description:
      "Prompt the implementation agent gets when you click Rebase in a ticket's PR tab. It resumes its own session and uses the Implementation model and effort.",
  },
};

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
