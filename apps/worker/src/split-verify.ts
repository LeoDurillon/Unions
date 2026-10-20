// Checks a split before it is pushed: the same content, every commit in its slice, each slice's checks.
import { sliceTips } from '@union/core';

import { runGate } from './gate';
import type { Rebase } from './rebase-agent';
import { simplifyProblem, type History } from './simplify-git';
import { checkout, stackCommits } from './stack-git';

export type Verified =
  | { ok: true; tips: string[]; checks: string }
  | { ok: false; problems: string[] };

/** The project's checks on each lower slice's tip; the top one ends with the reviewed content. */
async function sliceCheckProblems(rebase: Rebase, tips: readonly string[]): Promise<string[]> {
  const { deps, container, project, branch, context } = rebase;
  const command = project.config.gateCommand ?? '';
  const problems: string[] = [];
  await deps.services?.ensure();
  try {
    for (const [at, tip] of tips.slice(0, -1).entries()) {
      await checkout(deps.runtime, container, { detach: tip });
      const gate = await runGate(deps.runtime, container, command, context.signal);
      if (!gate.green) {
        problems.push(
          `Slice ${at + 1} fails the checks on its own (exit ${gate.exitCode}):\n\n\`\`\`\n${gate.tail}\n\`\`\``,
        );
      }
    }
  } finally {
    await checkout(deps.runtime, container, { branch });
  }
  return problems;
}

function checksRun(rebase: Rebase): boolean {
  const { config } = rebase.project;
  return config.sliceChecks !== false && (config.gateCommand ?? '').trim() !== '';
}

/** Why the split cannot be pushed, or each slice's tip (bottom first) and what was checked. */
export async function verifySplit(
  rebase: Rebase,
  input: { start: History; count: number },
): Promise<Verified> {
  const { deps, container, branch, base, project } = rebase;
  const problem = await simplifyProblem(deps.runtime, container, {
    branch,
    base,
    start: input.start,
  });
  if (problem) {
    return { ok: false, problems: [problem] };
  }
  const commits = await stackCommits(deps.runtime, container, input.start.fork);
  const tips = sliceTips(commits, input.count);
  if (!tips.ok) {
    return tips;
  }
  if (!checksRun(rebase)) {
    return { ok: true, tips: tips.tips, checks: '**Checks on each slice:** not run.' };
  }
  const problems = await sliceCheckProblems(rebase, tips.tips);
  return problems.length > 0
    ? { ok: false, problems }
    : {
        ok: true,
        tips: tips.tips,
        checks: `**Checks on each slice** (\`${project.config.gateCommand ?? ''}\`): passing.`,
      };
}
