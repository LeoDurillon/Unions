import { runGate, runInstall, type GateResult } from './gate';
import type { Workspace } from './implement-loop';
import { gateFailurePrompt } from './implement-prompts';

export type Checked = { gate: GateResult | null; retry: string | null };

export type { ImplementDeps } from './implement-loop';

/**
 * The checks after an agent turn; `retry` is what the session is sent when they are red. End-to-end
 * tests are not run here: they take a browser and a whole environment, so the user starts them from
 * the ticket's Preview section.
 */
export async function check(workspace: Workspace): Promise<Checked> {
  const { deps, context, project, container } = workspace;
  const { gateCommand } = project.config;
  const gate = gateCommand
    ? await runGate(deps.runtime, container, gateCommand, context.signal)
    : null;
  if (gate && gateCommand && !gate.green) {
    context.log({ type: 'union_gate', green: false, exitCode: gate.exitCode });
    return { gate, retry: gateFailurePrompt(gateCommand, gate) };
  }
  return { gate, retry: null };
}

export function install(workspace: Workspace): Promise<string | null> {
  const { installCommand } = workspace.project.config;
  return installCommand
    ? runInstall(
        workspace.deps.runtime,
        workspace.container,
        installCommand,
        workspace.context.signal,
      )
    : Promise.resolve(null);
}
