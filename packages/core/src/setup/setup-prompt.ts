// The setup agent's prompt: where Union's guide is, what to read, how each setting works, and the answer block to end with.
import { MAX_RUN_TIMEOUT_SEC } from '../container-runs';
import { PREVIEW_TEMPLATES } from '../preview/preview-config';
import { SETUP_GUIDE_PATH } from './setup-guide';

const READ = `## What to read

1. Union's user guide, at \`${SETUP_GUIDE_PATH}\`: \`previews.md\` (the preview, the agent's services, shared
   services, a database per preview, e2e tests, project files) and \`first-project.md\` and \`settings.md\` (the
   checks, scripts, instructions, agent image) before you propose anything. It is how Union uses each value.
2. The repository, all of what sets up and runs it, not a sample: the README and any \`AGENTS.md\` or \`CLAUDE.md\`;
   every package manifest (each app and package of a monorepo, and the workspace and task-runner config); every
   compose file and Dockerfile, with their profiles; the CI workflows; the env examples (\`.env.example\`,
   \`.env.test\`, \`.env.*.sample\`), and what the dev setup does with them; the test configs (unit, integration
   and e2e: jest, vitest, Playwright); the migration, seed and fixture scripts, and any database dump.

You have Read, Grep and Glob, and no shell: read the files, do not try to run a command (it is refused, and
wastes a turn). Read; do not guess. Base every value on a file you read, and name it under "why". When two answers fit, ask in
"questions" rather than pick one.`;

const SETTINGS = `## How to fill in each section

- **checks**: \`installCommand\` runs before each agent step; it must leave the workspace ready to build and test
  (install, then whatever the apps import that must be built first). \`gateCommand\` runs after every
  implementation step and the agent works until it passes: what CI runs on a pull request that needs no running
  service (lint, typecheck, unit tests), fast enough to run often.
- **scripts.items**: commands the user runs by name in a ticket's checkout (\`{ "name", "command", "timeoutSec"? }\`,
  1 to ${MAX_RUN_TIMEOUT_SEC} seconds, 600 by default): the test suites that the gate leaves out (integration, e2e
  per project), migrations, a seed.
- **preview**: start from the repository's own dev compose file; the guide says what Union changes in it. Union
  turns its mounts of the repository into mounts of the ticket's checkout, so a dev file that bind-mounts the code
  and runs dev servers works. Make it work rather than replace it:
  - \`env\` sets the variables compose passes to the services. Give each service's URLs from these templates instead
    of \`localhost\`: ${PREVIEW_TEMPLATES.map((template) => `\`{${template.name}}\``).join(', ')}.
  - \`composeAdditions\` is YAML merged over the file: override what the file hard-codes (an \`environment:\` entry, a
    command), add a restore of a database dump or a seed, a healthcheck.
  - \`services\` are the services a browser opens, \`{ "name", "port" (inside the container), "prefix" }\`; the first
    is the one Open goes to, the others take a short prefix (\`api\` answers at \`api-t12.union.localhost\`).
  - \`profiles\` to enable; \`agentServices\`, the services the agent needs while it implements (a database for its
    tests), forwarded to its \`localhost\` unless \`forwardPorts\` is false; \`startForImplementation\` when the agent
    should try its work in the running apps.
  - \`sharedServices\`: heavy or utility services run once for all previews (a virus scanner, a mail catcher, a
    database or an object store), never one built from the repository. For one that holds data, \`sharedCommands\`
    gives each preview its own: \`{ "service", "create", "drop" }\`, run in that service's container
    (\`createdb -U postgres app_{ticket.id}\`), and the apps' variables point at it.
  Union refuses privileged services, the host network, the Docker socket, mounts outside the repository, external
  volumes and \`union-…\` names. Propose a ticket for a new compose file only when variables and additions cannot
  make the existing one run, and say why.
- **e2e.command**: the e2e suite, run against the running preview. Read its config for the variables it needs: the
  commands get \`BASE_URL\` and \`UNION_URL_<SERVICE>\`, each service's address.
- **secrets**: variables whose real value must stay secret (API keys of outside services, signing keys in
  production). One entry per variable: its name, and where the user gets its value; never write one. A dev default from an example
  file (a local database password) can stay a plain \`env\` value.
- **projectFiles**: files a checkout needs that git does not hold (a database dump the additions restore, a local
  config), each a path in the repository and what goes in it; never their contents.
- **instructions**: markdown every agent on this project reads: how to build, test and run the code and what not to
  run. Agents already read the repository's \`AGENTS.md\` and \`CLAUDE.md\`: point to them, do not repeat them.
- **agentImage**: the agents' Debian image has git, Node 22, npm, pnpm and yarn (corepack), Bun and Playwright's
  system libraries. Only when the code needs more, a Dockerfile whose last stage starts \`FROM union-agent\`.
- **tickets**: changes the repository itself needs for the rest to work, each a title and a description for the
  agent that will do it.
- **questions**: what you could not decide from the files.`;

const FORMAT = `## Your answer

First a short summary in markdown of what you found. Then end with exactly one fenced \`json\` block, leaving out
any section you have nothing for:

\`\`\`json
{
  "summary": "one paragraph",
  "checks": { "installCommand": "", "gateCommand": "", "why": "the files this rests on" },
  "scripts": { "items": [{ "name": "", "command": "" }], "why": "" },
  "preview": {
    "composeFile": "", "composeAdditions": "", "services": [{ "name": "", "port": 3000, "prefix": "" }],
    "env": {}, "profiles": [], "agentServices": [], "forwardPorts": true, "startForImplementation": false,
    "sharedServices": [], "sharedCommands": [{ "service": "", "create": "", "drop": "" }], "why": ""
  },
  "e2e": { "command": "", "why": "" },
  "secrets": [{ "name": "", "where": "" }],
  "projectFiles": [{ "path": "", "what": "" }],
  "instructions": { "text": "markdown", "why": "" },
  "agentImage": { "dockerfile": "", "why": "" },
  "tickets": [{ "title": "", "description": "" }],
  "questions": []
}
\`\`\``;

/** The title and prompt of a setup run on `owner/repo`. */
export function setupPrompt(repository: string): { title: string; prompt: string } {
  return {
    title: `Set up ${repository}`,
    prompt: `You set up Union for the repository ${repository}, whose settings are still empty. Union runs coding
agents on its tickets, each in a container with a checkout of the repository, and runs each ticket's branch as a
preview from the repository's Docker Compose file. Propose its settings; the user reviews each section before Union
applies it.

${READ}

${SETTINGS}

${FORMAT}`,
  };
}
