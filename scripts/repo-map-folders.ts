// What each folder of the map holds, one sentence each, for the index `bun run map` writes.

/** By `<area>` (its root) or `<area>/<folder>`; `bun run map:check` fails when a folder has none, or one names no folder. */
export const FOLDER_SUMMARIES: Record<string, string> = {
  core: 'Shared code, flat: the state machine and phases, agents, their prompts, tools, usage and lessons, Docker (runtime, docker-cli, limits), GitHub auth and clients, tickets, flows, stacks and slices, diffs, pull request descriptions, investigations, notifications, Union settings and update.',
  'core/event':
    'Event rules: the events catalog and payloads, the rules and their actions (Jira, Notion, GitHub Project fields, pull requests), cursors and deliveries.',
  'core/integrations':
    'Jira and Notion: their API clients, configs and providers, comments and media, and the conversions between Markdown and Atlassian Document Format or Notion blocks.',
  'core/preview':
    "Previews: the compose file and its checks, config, memory caps, secrets, screenshots, and the shared services' stack and proxy.",
  'core/review':
    'Reviews: agent review runs, explanations, groupings by spec, review reports and their specs, the run lifecycle.',
  'core/schema': 'The Drizzle schema, one file per group of tables, and their shared column types.',
  'core/setup':
    "The setup agent offered at the end of the wizard: its prompt, its proposal's parts and preview, and applying it.",
  scripts:
    'Repository scripts: database backup, restore and reset, the live-instance activity check, the doc link and map checks, moving files, changed-file lint, Union update, usage backfill.',
  'scripts/ui-check': 'UI checks in a real browser, with every write blocked.',
  'web-client': 'The SPA entry: mounting and the top-level app.',
  'web-client/components':
    'Components not in a folder of their own: the board, its columns and cards, the ticket panel and its tabs (step, log, preview, pull request, tracker), the sidebar, Markdown and diagrams, pickers, dialogs and small UI pieces.',
  'web-client/components/agents':
    'The custom agent page: its form (model, effort, prompt, tools, connectors) and cards.',
  'web-client/components/environments':
    "A project's Environments tab: the preview settings (compose, services, variables, secrets, limits, e2e, agent) and the shared services.",
  'web-client/components/github-app':
    'How a project reaches GitHub: a token or a GitHub App installation.',
  'web-client/components/guide': 'The in-app user guide: its page, navigation and links.',
  'web-client/components/integrations':
    'The integrations step and sections: the GitHub Project, the trackers, importing from a source.',
  'web-client/components/integrations/jira':
    "Connecting Jira: its step, section and fields, and the fields of an event rule's Jira action.",
  'web-client/components/integrations/notion':
    "Connecting Notion: its step and section, and the fields of an event rule's Notion action.",
  'web-client/components/investigations':
    'Investigations: their page, form, thread, detail and export, and the tickets made from them.',
  'web-client/components/jira': "A ticket's Jira tab: its comments and replies.",
  'web-client/components/notifications': 'The notification bell and its panel, groups and items.',
  'web-client/components/notion': "A ticket's Notion tab: its discussions and replies.",
  'web-client/components/onboarding':
    'The new-project wizard: its steps (project, repository, connect, review), the stepper, the draft, the setup agent choice.',
  'web-client/components/previews': 'The running previews page and its button.',
  'web-client/components/pull-request':
    "A ticket's pull request: branch status and actions, CI checks, discussion and replies, description, the stack and splitting it, simplifying history.",
  'web-client/components/pull-requests':
    "The pull requests page: its list and stacks, and an imported pull request's review tabs (comments, description, Jira, Notion, preview, e2e).",
  'web-client/components/repository':
    'The repository browser: the file tree, the file viewer, refs and commits.',
  'web-client/components/review':
    'The review page: diffs and the file list, comments and threads, explanations, specs and grouping by spec, review reports, agent reviews, slices, sending the review.',
  'web-client/components/settings':
    "A project's settings page: its sections (flows, scripts, checks, size, files, memory and lessons, agent image, GitHub access, issues, pull requests, events and rules), nav and save bar.",
  'web-client/components/setup': "The setup agent's proposal, reviewed and applied card by card.",
  'web-client/components/union-settings':
    'The Union-wide settings: models, resources, custom agents, and their nav.',
  'web-client/components/union-update': 'Updating Union: the button and its dialog.',
  'web-client/components/usage':
    'The usage page: the Claude meter, cost, breakdowns and tables, findings and suggested improvements.',
  'web-client/lib':
    'Client logic, flat: API clients (`*-api`), hooks (`use-*`) for data, state and keys, the event stream and live invalidation, URL state, filters, formatting, notifications.',
  'web-client/lib/guide': "The user guide's API client, links and addresses.",
  'web-client/lib/integrations':
    "Jira and Notion hooks: comments, picks, users, review imports, a ticket's links.",
  'web-client/lib/preview':
    'Previews in the browser: API client, status, hooks for a preview, the running ones and the shared services.',
  'web-client/lib/review':
    "The review's data: API clients and hooks for the review, specs, explanations, groupings, reports, agent reviews, preview and tracker links.",
  'web-server':
    'Server code, flat: the Hono app and server, API types (`*-types`), GitHub reads (repository, pull requests, checks, commits, stacks, onboarding), Jira and Notion reads and comment commands, review and pull request import, guide pages, caches.',
  'web-server/routes':
    'The API routes by resource: projects and their settings, the events stream, agents, attachments, integrations, investigations, memory, notifications, previews, repository, setup, usage, Union settings and update.',
  'web-server/routes/pull-requests':
    'Pull request routes: listing, import, review load, checks, commits, description, comment replies, agent review.',
  'web-server/routes/review':
    'Review routes: current reviews, diff, comments, explanations, groupings, reports, runs, specs, trackers, preview, import and removal.',
  'web-server/routes/tickets':
    'Ticket routes: create, edit, detail, flow, base and retarget, links, Jira and Notion links, commits, pull request, stack, workspace, removal, resync.',
  worker:
    'The worker, flat: its entry, commands and hooks, scheduler and run pool, executor and step outcome, containers and workspaces, credentials, attachments and files sync, prompts, publishing, revision, review checkout, janitor and cleanup.',
  'worker/agent': 'Running `claude` in a container: idle detection and rate limits.',
  'worker/agent-image': "Building and checking the projects' own agent images.",
  'worker/event-actions':
    "Event rules' actions: GitHub comments, pull requests and Project fields, Jira comments, fields and transitions, Notion, Union notifications.",
  'worker/github':
    'GitHub sync: issues and pull requests, the board and Project fields, CI, comment replies, stacks, inbound changes, and the fake API the tests use.',
  'worker/implement': 'The implementation step: its loop, checks, prompts and size trimming.',
  'worker/investigation': 'Investigations: running one, and turning it into tickets.',
  'worker/jira': 'Posting Jira comments.',
  'worker/notion': 'Posting Notion comments.',
  'worker/preview':
    'Previews: compose up, the proxy and forwarder, health and readiness, idle stop, e2e runs and screenshots, variables, shared services.',
  'worker/pull-request':
    'Pull requests: adopting one, checking it out, writing its description, suggesting replies.',
  'worker/rebase':
    'Rebasing a ticket on its base: fetch, attempt, the agent on conflicts, publish, retarget, resync.',
  'worker/review':
    'Review side runs: agent reviews, explanations, groupings by spec, review reports.',
  'worker/simplify': "Simplifying a branch's history, alone or across its stack.",
  'worker/stack':
    'Stacks: splitting a branch into slices, publishing, pushing, following and revising them.',
  'worker/union-update': 'Updating Union itself from git.',
};
