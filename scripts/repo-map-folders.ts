// What each folder of the map holds, one sentence each, for the index `bun run map` writes.

/** By `<area>` (its root) or `<area>/<folder>`; `bun run map:check` fails when a folder has none, or one names no folder. */
export const FOLDER_SUMMARIES: Record<string, string> = {
  core: 'The package entry and what every part shares: the public API, the database, the tables, the ticket state machine and its phases.',
  'core/agent':
    "The agents' defaults and how a run resolves them: prompts, models, tools, denied commands, environment, connectors, log, answer formats.",
  'core/custom-agents':
    'Custom agents: their records, defaults, what still uses them, and the prompt writer that writes their instructions.',
  'core/diff':
    'Diffs: parsing, hunks, excerpts, the links agents cite, and change size against the budget.',
  'core/docker':
    "Docker: the `ContainerRuntime` interface and the `docker` CLI behind it, helper containers, limits, compose containers, the projects' agent images.",
  'core/event':
    'Event rules: the events catalog and payloads, the rules and their actions (Jira, Notion, GitHub Project fields, pull requests), cursors and deliveries.',
  'core/integrations':
    'Jira and Notion: their API clients, configs and providers, comments and media, and the conversions between Markdown and Atlassian Document Format or Notion blocks.',
  'core/flow':
    "Ticket flows: the steps a ticket runs, the project's presets, editing them, step titles.",
  'core/github':
    'GitHub: auth and clients, the optional layers (Project, issues), Project fields, text, issue step comments, file blobs, half-sent recovery.',
  'core/investigation':
    'Investigations: their records, defaults, and the tickets written from them.',
  'core/lessons':
    "The project's memory: lessons and feedback, the lesson writer and tidier, their prompts and queue.",
  'core/pull-request':
    "A ticket's pull request: description rewrites, comment replies, review verdicts, branch moves on GitHub, the followed base, resumed-implementer prompts.",
  'core/stack':
    'Stacks of pull requests: GitHub stacks, the split plan, slices, trailers, restack todos, status, descriptions and state-machine moves.',
  'core/ticket':
    'Tickets: records and dispatch, links and base, Needs you, start over, attachments, project files and scripts, command and CI outputs, refused commits.',
  'core/union':
    'Union itself: machine settings, its update, the work a restart interrupts, notifications.',
  'core/usage':
    'Agent usage: tokens and tool calls recorded from the log, Claude limits, totals and summaries, findings, and the "Suggest improvements" prompt.',
  'core/preview':
    'Previews: records, the compose file and its checks, config, memory caps, secrets, e2e screenshots and staleness, workspace owner, shared services.',
  'core/review':
    'Reviews: agent reviews and their runs, specs and spec sources, explanations, groupings by spec, review reports, the run lifecycle.',
  'core/schema': 'The Drizzle schema, one file per group of tables, and their shared column types.',
  'core/setup':
    "The setup agent offered at the end of the wizard: its prompt, its proposal's parts and preview, and applying it.",
  scripts:
    'Repository scripts: database backup, restore and reset, the live-instance activity check, the doc link and map checks, moving files, changed-file lint, Union update, usage backfill.',
  'scripts/ui-check': 'UI checks in a real browser, with every write blocked.',
  'web-client': 'The SPA entry: mounting and the top-level app.',
  'web-client/components/agents':
    'The custom agent page: its form (model, effort, prompt, tools, connectors) and cards.',
  'web-client/components/board':
    "The board: its page, top and toolbar, the project at a glance, the Needs you strip, columns (a phone's switcher), cards and their parts, finished rows, getting started.",
  'web-client/components/environments':
    "A project's Environments tab: the preview settings (compose, services, variables, secrets, limits, e2e, agent) and the shared services.",
  'web-client/components/flow':
    "A ticket's flow: the picker, its row in the details, the custom agents of a flow.",
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
    'Investigations: their page and list by week, header, form, conversation and tabs, export, and the tickets written from them.',
  'web-client/components/jira': "A ticket's Jira tab: its comments and replies.",
  'web-client/components/layout':
    "The app's frame: the main area and its lazy pages, the project bar and body, the sidebar and its parts, dialogs, help and shortcuts, the wizard host.",
  'web-client/components/markdown':
    'Markdown as the app shows it: folding, heading anchors, Mermaid diagrams and their export buttons.',
  'web-client/components/new-ticket':
    'Creating a ticket: the New ticket form, and importing a GitHub issue or pull request.',
  'web-client/components/notifications': 'The notification bell and its panel, groups and items.',
  'web-client/components/notion': "A ticket's Notion tab: its discussions and replies.",
  'web-client/components/onboarding':
    'The new-project wizard: its steps (project, repository, connect, review), the stepper, the draft, the setup agent choice.',
  'web-client/components/previews':
    "Previews: a ticket's or pull request's preview section and tab (controls, output, compose file, reset, e2e), and the running previews page.",
  'web-client/components/pull-request':
    "A ticket's pull request: its row and tab, branch status and actions, CI checks, discussion and replies, description, the stack and splitting it, simplifying history.",
  'web-client/components/pull-requests':
    "The pull requests page: its list and stacks, and an imported pull request's review tabs (comments, description, Jira, Notion, preview, e2e).",
  'web-client/components/repository':
    'The repository browser: the file tree, the file viewer, refs and commits.',
  'web-client/components/review':
    'The review page: diffs and the file list, comments and threads, explanations, specs and grouping by spec, review reports, agent reviews, slices, sending the review.',
  'web-client/components/settings':
    "A project's settings page: its sections (flows, scripts, checks, size, files, memory and lessons, agent image, GitHub access, issues, pull requests, events and rules), nav and save bar.",
  'web-client/components/setup': "The setup agent's proposal, reviewed and applied card by card.",
  'web-client/components/steps':
    "The Steps tab: a step's output, notices, review bar and answer form, verdict, start over, refused commits, the log, workspace commands and what their output becomes.",
  'web-client/components/ticket':
    'The ticket panel: header and ⋯ menu, its page (hero, status pill, progress, what it needs), tabs and keys, the Overview (details, links, base, size, runs, files, scripts), the review page.',
  'web-client/components/tracker':
    "A ticket's tracker item (Notion page, Jira issue): its rows in the Overview, the link forms, the tracker tab.",
  'web-client/components/ui':
    'Shared UI pieces: buttons, badges, fields and dialogs, choice inputs, code textarea, confirm button, dropzone, help text, icon buttons, overflow menu, tabs, detail rows.',
  'web-client/components/union-settings':
    'The Union-wide settings: models, resources, custom agents, and their nav.',
  'web-client/components/union-update': 'Updating Union: the button and its dialog.',
  'web-client/components/usage':
    'The usage page: the Claude meter, cost, breakdowns and tables, findings and suggested improvements.',
  'web-client/lib/app':
    "The app's frame: the `/api` client, the shared event stream and live invalidation, URL state and navigation, the active project and open ticket, the leave guard, help requests.",
  'web-client/lib/board':
    "The board's logic: filter, card order, labels, what a waiting ticket asks, the next one, keys, folded columns, card steps, starting tickets, getting started.",
  'web-client/lib/guide': "The user guide's API client, links and addresses.",
  'web-client/lib/integrations':
    "Jira and Notion hooks: comments, picks, users, review imports, a ticket's links.",
  'web-client/lib/preview':
    'Previews in the browser: API client, status, hooks for a preview, the running ones and the shared services.',
  'web-client/lib/review':
    "The review's data and logic: API clients and hooks (specs, explanations, groupings, reports, agent reviews), diff selection and rows, file tree and filter, slices.",
  'web-client/lib/investigations':
    "Investigations in the browser: the list's sections by week and its search, opening a new one on a ticket or one named in the URL.",
  'web-client/lib/log':
    "A Log's data: polling it, the agents' stream-json condensed into lines, runs folded apart, token counts, runs in progress.",
  'web-client/lib/markdown':
    'Rendering text: GitHub Markdown, heading anchors, repository links, Mermaid diagrams and their export, syntax highlighting.',
  'web-client/lib/notifications':
    'Notifications in the browser: their API client and hook, groups, opening one, desktop notifications.',
  'web-client/lib/pull-request':
    "A pull request's data: description rewrites, replies, CI checks and reruns, commits, stacks, importing one, the reviews without a ticket.",
  'web-client/lib/repository':
    "The Repository tab's data: its API, tree, links to GitHub, relative paths, and its place in the URL.",
  'web-client/lib/settings':
    "A project's settings in the browser: the sections and their form, environments, the agent image, GitHub access and Project, event rules, files, memory.",
  'web-client/lib/setup':
    "The setup agent in the browser: its API, follow-up, applying a proposal's parts, dismissed ones.",
  'web-client/lib/ticket':
    "A ticket's actions and data: commands and edits queued for the worker, progress, what it needs now, answers, files, origin, refused commits, workspace commands, the Steps tabs.",
  'web-client/lib/ui':
    'Small UI helpers: shortcuts, tab keys, closing popups, a stored number, the clock, relative times and durations, downloads, the folded sidebar.',
  'web-client/lib/union-settings':
    'The Union settings in the browser: their pages and URL, the agent, models and resources forms, tools, custom agents, connectors, the update.',
  'web-client/lib/usage':
    "The Usage page's data and wording: usage per range, findings' text, totals, chart scales.",
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
  'worker/jira': "Posting Jira comments and setting an issue's fields or status.",
  'worker/notion': "Posting Notion comments and setting a page's properties.",
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
