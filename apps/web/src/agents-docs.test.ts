// Keeps the agent tables of the user guide and the developer docs true to the agents' defaults.
import { expect, test } from 'bun:test';
import path from 'node:path';

import {
  AGENT_IDS,
  createDb,
  migrateDb,
  modelFor,
  resolveAgent,
  saveAgent,
  type AgentModel,
  type BuiltInAgentId,
} from '@union/core';

import { AGENT_LABELS } from '../client/components/agents/agent-labels';

const ROOT = path.join(import.meta.dir, '../../..');
/** What the guide writes for the agents that run on the Implementation model and effort. */
const IMPLEMENTER = "Implementation's";

async function tableUnder(file: string, heading: string): Promise<string[][]> {
  const text = await Bun.file(path.join(ROOT, file)).text();
  const section = text.split(`\n${heading}\n`)[1]?.split('\n## ')[0] ?? '';
  return section
    .split('\n')
    .filter((line) => line.startsWith('|'))
    .slice(2)
    .map((line) =>
      line
        .slice(1, -1)
        .split('|')
        .map((cell) => cell.trim()),
    );
}

/** The guide's model for each agent title, from rows like `| Planning | Intake, Summary | Haiku, Sonnet |`. */
async function guideModels(): Promise<Map<string, string>> {
  const models = new Map<string, string>();
  for (const [, agents = '', modelCell = ''] of await tableUnder(
    'documentation/agents.md',
    '## The agents',
  )) {
    const titles = agents.startsWith('**') ? [] : agents.split(', ');
    const listed = modelCell.split(', ');
    for (const [at, title] of titles.entries()) {
      models.set(title, listed.length === 1 ? modelCell : (listed[at] ?? ''));
    }
  }
  return models;
}

function capitalized(word: string): string {
  return `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
}

/** The model the guide should show: the agent's default, or the implementer's when it follows it. */
function expectedModels(): Map<string, string> {
  const db = createDb(':memory:');
  migrateDb(db);
  const agents = AGENT_IDS.filter(
    (agent): agent is Exclude<BuiltInAgentId, 'shared'> => agent !== 'shared',
  );
  // An agent follows the implementer when its model moves with Implementation's, whatever that is.
  const withImplementer = (model: AgentModel): Set<string> => {
    saveAgent(db, 'implement', { prompt: resolveAgent(db, 'implement').prompt, model });
    return new Set(agents.filter((agent) => modelFor(db, agent) === model));
  };
  const onHaiku = withImplementer('haiku');
  const onSonnet = withImplementer('sonnet');
  return new Map(
    agents.map((agent) => {
      const follows = agent !== 'implement' && onHaiku.has(agent) && onSonnet.has(agent);
      const model = resolveAgent(db, agent).defaultModel ?? '';
      return [AGENT_LABELS[agent].title, follows ? IMPLEMENTER : capitalized(model)];
    }),
  );
}

test("the guide's agent table names every agent with its default model", async () => {
  expect(Object.fromEntries(await guideModels())).toEqual(Object.fromEntries(expectedModels()));
});

test("the developer page's table lists every agent", async () => {
  const rows = await tableUnder('docs/architecture/agents.md', '## Where each agent runs');
  const listed = rows.flatMap(([agents = '']) =>
    [...agents.matchAll(/`(?<id>[a-z_]+)`/gu)].map((match) => match.groups?.id),
  );
  expect(new Set(listed)).toEqual(new Set(AGENT_IDS.filter((agent) => agent !== 'shared')));
  expect(listed).toHaveLength(AGENT_IDS.length - 1);
});
