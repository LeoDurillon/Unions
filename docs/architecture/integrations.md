# GitHub and Notion

<!-- Moved from AGENTS.md: read the file for the area you change; keep it current when behavior changes. -->

- All GitHub writes for tickets (issues, comments, Project status, push, PR) happen in the worker. Containers never
  hold GitHub credentials. The only GitHub calls the web server makes are the ones the UI needs answered right away:
  the setup wizard (verify the token, list repositories and Projects, create a Project), checking and listing the
  GitHub App's installations (`/api/github/app`), looking up a pull request a user links to a ticket, reading an
  issue to create a ticket on it (`routes/issue-import.ts`), reading a linked pull request's discussion (PR tab,
  review import), a reviewed pull request's files and commits, and listing the repository's pull requests and stacks (project bar → Pull requests,
  `routes/pull-requests.ts`; the Under review part's records are local, under `/pull-requests/reviews`,
  `routes/current-reviews.ts`), all read only (`src/github-onboarding.ts`, behind the `OnboardingGitHub` interface
  so tests use a fake), and a linked pull request's CI checks (PR tab: check runs, statuses, bot comments, the
  annotations and job logs of a pick; `src/github-checks.ts` behind `CiGitHub`). Posting a pull request review is a write: it goes through the `submit_pr_review` command
  and the worker (`github/pr-review.ts`). So is replying to a pull request's comments: the `reply_pr_comment`
  command, posted by `github/pr-comment-reply.ts` (GraphQL `addPullRequestReviewThreadReply` and
  `resolveReviewThread` for a line thread, `POST /issues/{n}/comments` for a conversation comment); the web only
  says who posts from the stored credentials (`pr-replies.ts`), without a GitHub call.
- Notion writes happen in the worker only: event rules set properties of a ticket's page, or for a review posted from the review panel, the page that review is linked to (`updatePage`; `event-actions/notion.ts`), and a
  ticket written from an investigation can be created as a page of the project's data source (`createPage`, with
  `markdown` content). A comment typed in a ticket's Notion tab is the `post_notion_comment` command
  (`{ projectId, ticketId, pageId, discussionId | null, text }`, core's `notion-comment-post.ts`); the worker's
  `notion/comment-post.ts` converts the text (core's `notion-rich-text.ts`: links, `**bold**`, `` `code` ``) and
  posts it with `addComment` (`POST /v1/comments`, in the discussion or on the page), under the integration's name,
  and logs `notion_comment_posted` or `notion_comment_failed` (403 names the "Insert comments" capability).
- Trackers a project is connected to (Notion now) are rows of `integrations`, one per kind: secret, config, the
  tracker's columns as read. Each kind has a browser-safe entry (`@union/core/integration-kinds`: label, ID parsing,
  config check) and a provider over its API client (`integrationProvider`, `integrations/providers.ts`). The web
  routes are generic (`routes/integrations.ts`): `POST /api/integrations/:kind/verify` (no project: onboarding),
  and under `/api/projects/:id/integrations/:kind`, `PUT` (reads the columns with the new secret and config, then
  saves; no secret keeps the stored one), `DELETE`, `POST /fields` (read the columns again) and `POST /import` (an
  item of the source as a ticket preview). A new project takes `integrations: [{ kind, secret, config }]`. The
  browser sees `PublicProject.integrations` (`toPublicIntegration`, `public-project.ts`: kind, title, config,
  `ready`), never a secret. The web server never calls a provider's `createItem`, nor Notion's `createPage`, `updatePage` or
  `addComment` (ast-grep `web-reads-trackers-only`). A new ticket takes `origin: { kind, id, url }` (`routes/ticket-origin.ts`, which also
  keeps the item's images per kind), and an investigation's ticket `target: kind`. In the client, the New ticket
  dialog has one "Import from …" tab per ready integration (`components/integrations/source-import.tsx`), the
  investigation one "Also create it in …" switch per integration, and each kind's own screens (settings,
  onboarding step, rule action fields) live in `components/integrations/<kind>/`.
- Notion reads, from the web server: verifying a project's integration secret and data source, and importing
  a page of that data source as a ticket (`src/notion.ts` behind `NotionApi`, through the Notion
  `IntegrationProvider`), the pages a pull
  request under review is linked to and the review's Notion specs (any page shared with the integration;
  `routes/review-notion.ts`, `routes/review-specs.ts`, their text (and in the review's Notion tab, their open discussions) read fresh each time, mention titles from core's `integrations/notion-mentions.ts`), and the open
  discussions of a ticket's page (`routes/notion-comments.ts`, `GET /api/tickets/:id/notion-comments`; `src/notion-discussions.ts`
  reads the page's comments, then those of each block its markdown marks as commented, one block at a time and at
  most 30; core's `notion-comments.ts` groups them and quotes the commented text; needs the integration's "Read
  comments" capability, a 403 answers which). Uses API version
  `2026-03-11` and `GET /v1/pages/{id}/markdown`. The secret, data source and columns as read are a row of
  `integrations` (kind `notion`; `integrations/notion-integration.ts` reads and saves it), never sent to the browser.
  (Before `0070_source_integrations` they were `projects.notion_token`, `config.notionDataSourceId` and the table
  `notion_data_sources`; `0071_drop_legacy_notion` dropped them with `tickets.notion_page_id` and
  `investigations.ticket_in_notion`.) A ticket's page is its
  origin (`tickets.origin_kind`, `origin_id`, `origin_url`). Pages outside the configured data source are refused. The page's markdown is cleaned at import (`notionMarkdown` in the browser-safe `@union/core/notion-markdown`: mentions become links titled from Notion, callouts quotes, comment and color spans their text, toggle children are dedented, file, PDF, video and audio blocks (`<file src="…">`, `source=` in Notion-flavored markdown) become links named by their caption or file name); the ticket panel cleans older imports as it shows them. Creating a ticket from a page downloads its images and the files it links (`notion-files.ts`; Notion's signed links expire within the hour; only Notion's file hosts, images first, raster images only, then files of any type named after the upload, four at a time, within the attachment limits) into private ticket files referenced as `attachment:<name>`. The panel shows images inline (`?inline`, raster images only) and links other files as downloads; a file not kept keeps its Notion link.
- Jira reads (Jira Cloud only), from the web server: verifying a site, account email and API token
  (`GET /rest/api/3/myself`, then the project), reading the project's name, issue types and statuses
  (`integrations.fields`), and importing an issue of the configured project as a ticket (`GET /issue/{key}`, its
  ADF description converted by core's `integrations/adf-markdown.ts`). The client is `FetchJiraApi`
  (`integrations/jira-api.ts`, behind `JiraApi`; Basic auth with `email:token`, a 30 s timeout, redirects refused).
  The token is the integration's secret; the config is `{ site, email, projectKey }` (`jira-config.ts`), and the
  site must be `https://<name>.atlassian.net`: the client checks it again before each request, so the token never
  goes to another host. A pasted link of another site is refused (`IntegrationKind.refError`). The import links the
  issue's attachments (`jira-attachments.ts`: a media node matched by its Media Services id, read from where Jira
  redirects the attachment's download when the text has a file card without a name (`jira-media-ids.ts`), else by
  file name; the rest listed under
  "Attachments"), as `/rest/api/3/attachment/content/<id>` of the site; creating the ticket downloads them
  (`apps/web/src/jira-files.ts`, over the shared `tracker-files.ts` that Notion's `notion-files.ts` uses too: only
  that path of the configured site, with the token; Jira's redirect to its media host is followed by hand without
  it, and only to https) into private ticket files, within the attachment limits. Jira writes happen in the worker
  only, from event rules on tickets imported from Jira, or for `pr_review_posted` the Jira issues the review is
  linked to (`event-actions/jira-*.ts`, `jiraTargets`; `jira-target.ts`'s `jiraIssueOf` gives the keys, `eachIssue`
  runs the action on each in turn and joins their details): a move reads the
  issue's status and transitions and posts the one that leads to the rule's status; fields are checked against the
  issue's `editmeta`, then sent in one `PUT` (labels as `update` operations); comments go as ADF (core's
  `text-adf.ts`). Picked fields (`user`, `versions`, `components`, `sprint`; `jira-field-types.ts`) store their
  picks' ids with their names; the editor reads the lists from `GET /api/projects/:id/jira/picks/:type`
  (`routes/jira-picks.ts`, core's `jira-picks.ts` over `JiraApi.read`: assignable users, the project's versions and
  components, the first board with sprints' active and future sprints (scrum, else a team-managed project's "simple" board) through Jira Software's `/rest/agile/1.0`), never
  stored. "The active sprint" and "the next sprint" are resolved at delivery (`worker/event-actions/jira-field-picks.ts`).
  Multi-selects are typed as option names and checked against `editmeta` as single selects are. The rules editor reads the stored statuses and settable fields (`GET /field`, kept in
  `integrations.fields` by Refresh; `jira-field-types.ts`) from the rules list (`jiraRuleSourceOf`). The web calls
  none of the writes (ast-grep `web-reads-trackers-only`). Jira's `createItem` (`jira-create.ts`, called by the
  worker's `withTargetItem` for a ticket written from an investigation) reads the project's issue types, picks the
  configured `issueTypeId` if the project still has it, else Task, else its first type (never a sub-task), and posts
  `POST /rest/api/3/issue` with the summary (255 characters at most) and the description converted by core's
  `markdown-adf.ts` (mdast with GitHub's extensions, from the `markdown` catalog; inline code keeps only a link
  mark, as ADF requires). Jira's refusal (a required field) is the investigation's `ticket_error`.
- A review of someone else's pull request links Jira issues as its `jira` specs (core's `review-specs.ts`:
  `linkJiraIssue`, `linkedJiraIssues`, `unlinkJiraIssue`). `routes/review-jira.ts` (under `<review>/jira`) reads
  their descriptions and comments for the review's Jira tab, checks a key or link of the site (any project, as
  specs), links and unlinks; `/suggestions` reads the keys the title, head branch and description name (core's
  `jira-keys.ts`: the project's key prefix only, bare or as a `/browse/` link of the site), reads each (at most 10)
  and drops the linked and unreadable ones. Nothing is written to Jira.
- A Jira ticket's comments: the web reads them for its Jira tab (`routes/jira-comments.ts`, `GET
  /api/tickets/:id/jira-comments`; `JiraApi.comments`, newest first, 100 a page, 5 pages at most, shown oldest
  first; core's `jira-comments.ts` converts each with `adfMarkdown`, media by name, and names a role, group or
  internal restriction), with the comments not posted yet (`pending-comments.ts`, shared with Notion's) and those in
  the review. Posting is the `post_jira_comment` command (`{ projectId, ticketId, key, text, replyTo }`, core's
  `jira-comment-post.ts`); the worker's `jira/comment-post.ts` sends the text as ADF, a reply starting with a
  mention of the author (`textAdf(text, mention)`), and logs `jira_comment_posted` or `jira_comment_failed` (403
  names "Add comments"). Add to review (`POST …/jira-comments/import`, `jira-review-import.ts`) reads the comment
  again and adds a `general` draft whose `source_url` is the comment's link (`jira-comment-link.ts`); sending the
  review never asks such a draft a GitHub reply (`markSent` leaves out Notion's and Jira's links).
- A project reaches GitHub with a token (`projects.github_token`) or an installation of the GitHub App
  (`projects.github_installation_id`; the app's ID and private key are one row of `github_app`). Both are stored in
  plain text (local single-user app, like the original Union) and never reach the browser: responses use
  `PublicProject` / `toPublicProject` (`githubAccess` only) and the app status omits the key. Resolve credentials
  with `projectGitHubAuth` (`@union/core`; installation wins, then token, then `GITHUB_TOKEN`) and build clients
  with `@union/core/github-client`: clients are cached per credential so an installation token is minted once an
  hour, and git gets a fresh token (`gitToken`) right before each clone or push. Every request is bounded
  (`timeoutMs`, `retries`: 30 s per attempt; the web server 20 s and one retry): Octokit queues token minting and
  GraphQL per process, so one stuck request used to block every later call until a restart. Those bounds only cover
  `fetch`, so the web server also sets `deadlineMs` (45 s for the whole call, queues and token minting included,
  failing as a 504) and `throttled: false` (no process-wide throttling queues for its reads): without them its
  GitHub reads once all waited forever while the worker's still worked. Never build an Octokit
  from a project's token by hand.
- Permissions: the GitHub App's form is pre-filled (`app-setup-form.tsx`) with Contents, Issues and Pull requests
  read and write, Metadata read, Checks and Commit statuses read, Actions read and write (the PR tab's CI checks:
  check runs and annotations, commit statuses, job logs; the worker's poll of the PR's checks rollup, which reads as
  unknown without them; write only to re-run a failed job), organization Projects read and write. An existing installation must
  accept added permissions on GitHub (Settings → GitHub Apps → the request) before they apply; until then the CI
  reads answer 403, which `routes/pr-checks.ts` turns into a message naming them. Replies to comments need only
  Pull requests read and write (the issue-comments endpoint takes Issues or Pull requests); a refusal (a 403, or
  GraphQL's "Resource not accessible") is reported naming it. A classic token needs `repo` and `project`.

## Union's own remote

The sidebar's Update fetches Union's checkout's `origin` (`docs/spec/union-update.md`), not a project's. An SSH
`origin` uses the host's `~/.ssh`, mounted read-only into the worker container only (`UNION_SSH_DIR` in
`compose.yaml`); the web and the agent containers never get it. The fetch runs with `BatchMode=yes` and
`StrictHostKeyChecking=yes`, so a key with a passphrase or an unknown host fails instead of prompting.
