// Reads the setup agent's answer into a proposal: its final `json` block, each value checked, refusals listed.
import { lastJsonBlock } from '../json-block';
import { parseScripts, ScriptsError } from '../project-scripts';
import { lines, records, section, text, type Dropped } from './setup-proposal-parts';
import { previewOf, secretsOf } from './setup-proposal-preview';
import type {
  SetupChecks,
  SetupProjectFile,
  SetupProposal,
  SetupScripts,
  SetupText,
  SetupTicket,
} from './setup-proposal-types';

const MAX_DOCUMENT = 20_000;
const SETUP_KEYS = ['summary', 'checks', 'preview', 'scripts', 'instructions'];

function checksOf(value: unknown): SetupChecks | null {
  const block = section(value);
  const installCommand = text(block?.installCommand);
  const gateCommand = text(block?.gateCommand);
  if (installCommand === '' && gateCommand === '') {
    return null;
  }
  return { installCommand, gateCommand, why: text(block?.why) };
}

function scriptsOf(value: unknown, dropped: Dropped): SetupScripts | null {
  const block = section(value);
  if (!block) {
    return null;
  }
  try {
    const items = parseScripts(block.items);
    return items.length === 0 ? null : { items, why: text(block.why) };
  } catch (error) {
    if (!(error instanceof ScriptsError)) {
      throw error;
    }
    dropped.push(`Scripts: ${error.message}`);
    return null;
  }
}

/** A section holding one text under `key` (a command, markdown, a Dockerfile), and why. */
function textOf(value: unknown, key: string, max = MAX_DOCUMENT): SetupText | null {
  const block = section(value);
  const body = text(block?.[key], max);
  return body === '' ? null : { text: body, why: text(block?.why) };
}

/** A relative path inside the repository, as Project → Files takes it. */
function isRepoPath(path: string): boolean {
  return path !== '' && !path.startsWith('/') && !path.split('/').includes('..');
}

function projectFilesOf(value: unknown, dropped: Dropped): SetupProjectFile[] {
  return records(value).flatMap((item) => {
    const path = text(item.path);
    if (!isRepoPath(path)) {
      dropped.push(`File "${path}": not a path inside the repository`);
      return [];
    }
    if ('contents' in item) {
      dropped.push(`File "${path}": its contents were left out; give the file yourself`);
    }
    return [{ path, what: text(item.what) }];
  });
}

function ticketsOf(value: unknown): SetupTicket[] {
  return records(value)
    .map((item) => ({ title: text(item.title), description: text(item.description, MAX_DOCUMENT) }))
    .filter((ticket) => ticket.title !== '');
}

/** The proposal in the agent's answer; null when the answer holds no setup block. */
export function parseSetupProposal(answer: string): SetupProposal | null {
  const block = lastJsonBlock(answer, (candidate) => SETUP_KEYS.some((key) => key in candidate));
  if (!block) {
    return null;
  }
  const dropped: Dropped = [];
  return {
    summary: text(block.summary),
    checks: checksOf(block.checks),
    scripts: scriptsOf(block.scripts, dropped),
    preview: previewOf(block.preview, dropped),
    e2e: textOf(block.e2e, 'command'),
    secrets: secretsOf(block.secrets, dropped),
    projectFiles: projectFilesOf(block.projectFiles, dropped),
    instructions: textOf(block.instructions, 'text'),
    agentImage: textOf(block.agentImage, 'dockerfile'),
    tickets: ticketsOf(block.tickets),
    questions: lines(block.questions),
    dropped,
  };
}
