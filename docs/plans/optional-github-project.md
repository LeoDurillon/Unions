# The GitHub Project and issues as choices

Status: planned (2026-11-07). Relates to [One adapter per tracker](tracker-adapters.md) (its D7: GitHub Project
fields join the shared field types).

## Why

Union started as "a local Kanban over a GitHub Project" (`docs/spec/README.md`): every ticket is a GitHub issue and
an item of the project's GitHub Project, its column is the Project's Status field, and GitHub is the source of truth
for title, description and status (`docs/spec/stack.md`, GitHub mapping). Since then a ticket can come from Notion
or Jira, and for those teams the mirror is a second copy of the same work:

- **Duplication.** A ticket imported from Jira is a Jira issue, a GitHub issue and a Project item. The team reads
  Jira; the GitHub issue and board are noise, and their notifications go to the repository's watchers.
- **Setup friction.** Projects need the `project` scope (`REQUIRED_SCOPES` in `github-onboarding.ts`). Fine-grained
  tokens and the GitHub App cannot reach a Project owned by a user account, so the spec asks for a classic token:
  the hardest step of the setup wizard, for a board the team may not want.
- **All or nothing.** The worker's sync (`github/sync.ts`) resolves the Project first and stops when it cannot
  (`resolveNodeId`): without a Project there are no issues and no step comments either.

Part of the code is ready: a ticket without an issue already has a branch (`union-<ticket id>-<slug>`,
`branch.ts`) and a pull request without `Closes #n` (`publish.ts`), and the worker checks `issueNumber === null` in
about ten places.

## What the user gets

- In the setup wizard, the GitHub Project is part of the **Integrations** step, beside Notion and Jira: pick or
  create one, or none. With none, the token needs only `repo` (or a fine-grained token, or the App, on a user
  account).
- **Settings → Integrations → GitHub Project**: connect one later, or disconnect it. Disconnecting leaves the board
  and its items on GitHub as they are.
- **Settings → General → Mirror tickets as GitHub issues** (on by default): off, a ticket written in Union or
  imported from Notion or Jira gets no GitHub issue. Its step outputs stay in Union (the ticket panel), its branch
  is `union-<id>-<slug>`, its pull request does not close an issue.
- A ticket imported from a GitHub issue keeps that issue whatever the setting: the issue is its source.
- Without a Project, Union's board is the only board: its column is not pushed anywhere, and starting a ticket from
  GitHub's board is not possible.
- Rule actions follow: **Set fields of the ticket's GitHub Project item** is offered only with a Project connected;
  **Comment on GitHub, on the issue** only when the project mirrors issues (a ticket without one skips, saying so).

## Decisions

- **D1. Three layers, two of them optional.** The repository (branches, pull requests, CI, reviews) is required.
  Issues (ticket → issue, a comment per step, `Closes #n`, the parent's "blocked by") are a setting of the project.
  The Project (item, Status field, pulling the board's changes, Project field rules) is an integration. A Project
  needs issues: connecting one turns mirroring on, and mirroring cannot be turned off while one is connected.
- **D2. The Project stays in its columns.** `projects.github_project_url` (null: none) and
  `github_project_node_id` already say whether there is one; no migration of the user's projects, and existing
  projects keep theirs. It is not a row of `integrations`: it has no secret of its own (it uses the project's
  GitHub credentials, `projectGitHubAuth`) and is not an import source. The UI shows it with the integrations
  (`tracker-section.tsx`'s pattern), the rule filter treats it as one (`offered-action-kinds.ts`).
- **D3. The mirror is a config flag.** `ProjectConfig.mirrorIssues` (absent: true, so nothing changes for existing
  projects). Turning it off stops creating issues for new tickets; tickets that have one keep it and its comments
  (nothing on GitHub is closed or deleted). Turning it back on creates the missing issues on the next sync.
- **D4. The sync in two parts.** `GitHubSync` splits into the issue part (create the issue, step comments,
  dependencies, pulling the issue's title and description) and the board part (item, Status field, pulling the
  column). Each runs only when its layer is on; a missing Project is no longer an error. Title and description
  edits made on GitHub are read from the issue itself (`GET /repos/…/issues?since=`) instead of from the board's
  items, so they still reach Union without a Project.
- **D5. The source of truth follows the layers.** With a Project, GitHub wins for title, description and status, as
  now. With issues and no Project, GitHub wins for title and description, Union for status. With neither, Union
  (or the ticket's tracker, for an imported ticket) owns everything. `docs/spec/stack.md`'s mapping says so.
- **D6. Scopes follow the layers.** The onboarding check asks for `project` only when a Project is picked or
  created; a fine-grained token or the App on a user account is accepted for a project without one.

## Steps

1. **The sync in two parts.** D4 in the worker, D3's flag read with its default; tests with the fake GitHub API: a
   project with a Project (unchanged), with issues and no Project (issues and comments, no item, no error), with
   neither (no GitHub write but the branch and pull request), an imported GitHub issue keeping its issue. Real
   check against GitHub on a test repository after asking (it creates issues).
2. **Issue edits without the board.** Pulling title and description from the repository's issues (D4); tests on
   stale reads, as `inbound.ts`'s `isStale`.
3. **Settings.** General's **Mirror tickets as GitHub issues** (D1's constraint), Integrations' **GitHub Project**
   (connect: pick or create, as the wizard; disconnect). Routes write the columns and the config only; the worker
   does the GitHub calls. UI check.
4. **The wizard.** The Project in the Integrations step, optional; the scope check (D6). UI check of a project
   created without a Project, with a fine-grained token.
5. **Rules.** The two actions' filters and the delivery's skip ("The ticket has no GitHub issue"); tests.
6. **Docs.** `docs/spec/README.md` (its first line and decisions), `docs/spec/stack.md` (the mapping, by layer),
   `docs/spec/flow.md` (first run), `documentation/first-project.md`, `documentation/tickets.md`,
   `documentation/automation.md`, `docs/architecture/integrations.md`, this plan's status.

## Risks

- **A ticket's step outputs only in Union.** Without issues, what the agents wrote is not on GitHub for the
  reviewers; the pull request's description still carries the agent's summary (`publish.ts`). The setting's hint
  says so.
- **Turning issues off and on.** Tickets created while it was off get their issues when it is back on: many at once
  for a busy project. The sync creates them as it does now, one ticket at a time, within the rate limits.
- **Starting from GitHub's board.** Users who move cards on GitHub to start runs lose that without a Project; it
  stays for those who keep one.
- **Duplicates across trackers stay possible.** A Jira project can keep issues on; the setting's hint suggests
  turning them off when a tracker is the source.
