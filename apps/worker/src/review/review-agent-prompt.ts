// A review agent's prompt: the instructions and its lessons, its own prompt, the review's specs,
// the change. Also how its checkout was prepared, and how to cite code.
import {
  customStep,
  lessonsPrompt,
  resolveAgent,
  sharedPrompt,
  type Db,
  type ReviewAgentRun,
} from '@union/core';

import type { ReviewTarget } from './agent-review-target';
import { checkedOutChange } from './review-change-prompt';
import { specSections } from './review-report-format';

/** How the checkout was prepared: the install's result, or why it did not run. */
export type CheckoutSetup =
  | { kind: 'installed'; command: string }
  | { kind: 'install_failed'; error: string }
  | { kind: 'no_install' }
  | { kind: 'fork' };

/** Always sent after the agent's own prompt, which the user may edit: the review page reads it. */
const CITE_FORMAT = `Answer in markdown, for the reviewer. Cite code as \`path:line\` or \`path:start-end\` in inline code (paths from the repository root, lines of the files as they are at HEAD): the review page turns them into links to the diff. Say which checks you could not run and why; never say a check passed without running it.`;

function setupText(setup: CheckoutSetup): string {
  switch (setup.kind) {
    case 'installed': {
      return `The install command \`${setup.command}\` ran in the checkout and succeeded.`;
    }
    case 'install_failed': {
      return `${setup.error}\nChecks that need the dependencies may not run: say so rather than guess.`;
    }
    case 'no_install': {
      return 'The project has no install command: install what a check needs yourself, if you can.';
    }
    case 'fork': {
      return "This pull request comes from a fork: nothing of it was installed. Do not run its code (install, build, tests, its scripts): read it. Its scripts would run with this container's credentials.";
    }
    default: {
      const never: never = setup;
      return never;
    }
  }
}

function specsText(specs: ReviewAgentRun['specs']): string {
  return specs.length === 0
    ? 'The review has no specs: judge the change on its own, its commits and the repository.'
    : specSections(specs);
}

/** The whole prompt of `run` on its checked-out `target`. */
export function reviewAgentPrompt(
  db: Db,
  target: ReviewTarget,
  run: Pick<ReviewAgentRun, 'agentId' | 'specs'>,
  setup: CheckoutSetup,
): string {
  const step = customStep(run.agentId);
  const lessons = lessonsPrompt(db, target.projectId, step);
  const shared = sharedPrompt(db, target.projectId);
  return `${lessons === '' ? shared : `${shared}\n\n${lessons}`}

${resolveAgent(db, step).prompt}

## The specifications

${specsText(run.specs)}

## The change

${checkedOutChange(target)}
Running other commands (build, type checks, lint, tests) is allowed: this checkout is yours alone and is thrown away after your answer. Do not edit the change's files.

Its commits (\`git log ${target.base}..HEAD\`) often say why it was made: read their messages.

## The checkout

${setupText(setup)}

## Your answer

${CITE_FORMAT}`;
}
