import type { GateResult } from './gate';
import type { PublishResult } from './publish';

/** Appended to the first implement prompt so the agent knows how its work is checked. */
export function gateHint(command: string | undefined): string {
  return command
    ? `\n\nWhen you finish, the checks run with \`${command}\`. Run them yourself before finishing.`
    : '';
}

/** Sent into the resumed session when the user asks for changes. */
export function feedbackPrompt(feedback: string): string {
  return `# Feedback from the user\n\n${feedback}\n\nAddress it in the code, run the checks, commit, and finish with an updated report.`;
}

/** Sent into the resumed session when the checks failed after the agent finished. */
export function gateFailurePrompt(command: string, gate: GateResult): string {
  return `# The checks failed\n\n\`${command}\` exited with ${gate.exitCode}. Last lines:\n\n\`\`\`\n${gate.tail}\n\`\`\`\n\nFix the cause, commit, and finish with an updated report.`;
}

export type ImplementReport = {
  agentReport: string;
  gateCommand: string | undefined;
  gate: GateResult | null;
  iterations: number;
  branch: string;
  ahead: number;
  base: string;
  publish: PublishResult;
};

function checksLine(report: ImplementReport): string {
  const { gate, gateCommand, iterations } = report;
  if (!gate || !gateCommand) {
    return '**Checks:** none configured (set a check command in the project settings).';
  }
  const rounds = iterations === 1 ? '1 iteration' : `${iterations} iterations`;
  return gate.green
    ? `**Checks** (\`${gateCommand}\`): passing after ${rounds}.`
    : `**Checks** (\`${gateCommand}\`): still failing after ${rounds} (exit ${gate.exitCode}).\n\n<details><summary>Last check output</summary>\n\n\`\`\`\n${gate.tail}\n\`\`\`\n\n</details>`;
}

function branchLine(report: ImplementReport): string {
  const { publish, branch } = report;
  if (publish.error) {
    return `**Branch** \`${branch}\`: push failed: ${publish.error}`;
  }
  if (publish.pullRequest !== null) {
    return `**Branch** \`${branch}\`: pushed · PR #${publish.pullRequest}.`;
  }
  const note = publish.manualPullRequest
    ? " No pull request opened (automatic creation is off): link one from the ticket's Overview tab."
    : '';
  return `**Branch** \`${branch}\`: pushed.${note}`;
}

/** The step output: the agent's own report, then what the host checked and published. */
export function renderImplementReport(report: ImplementReport): string {
  return [
    report.agentReport.trim(),
    '---',
    checksLine(report),
    branchLine(report),
    `**Commits:** ${report.ahead} ahead of \`${report.base}\`.`,
  ].join('\n\n');
}
