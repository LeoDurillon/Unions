# Plan: previews of pull requests under review

Status: step 1 built (branch `review-previews`): the owner in core and the database; steps 2 to 6 left.

## Idea

A pull request under review (Pull requests → Current reviews, no ticket) gets what a ticket's Preview tab has: the
project's compose environment run at the commit the review reads and served by the proxy, its end-to-end tests,
and Commands in its checkout. The user tries the change while reading its diff, without making a ticket for it.

It uses no Claude usage (no agent runs) and writes nothing to GitHub: the worker only fetches the pull request, as
the agent review already does.

## What exists

- A ticket's preview (`docs/plans/preview-environments.md`) runs from the ticket's workspace volume
  (`union-t<id>-ws`), as compose project `union-t<id>`, at `http://<id>.localhost:8080`. Its row in `previews` is
  keyed by `ticket_id`; every change is a `preview_changed` event on the ticket.
- Its e2e tests (`e2e.ts`) and Commands (`container-run.ts`, `container_runs`) run in the ticket's container
  (`union-t<id>`), which joins the preview's networks; failure screenshots are ticket files
  (`replaceE2eScreenshots`). Their output can go to the implementer ("Send to agent", `for_agent`).
- An agent review of a pull request checks it out in a throwaway container (`throwawayCheckout`,
  `clonePullRequest` in `pr-checkout.ts`): the host clones the base branch, fetches `pull/<n>/head`, keeps
  `review.headSha` and copies the checkout in with a token-free `origin`. Forks work through `pull/<n>/head`.
- The review page (`pr-review-sections.tsx`) adds tabs before the diff; review runs have no event stream, the
  client polls while one is active (`use-agent-review.ts`).

## Decisions

**A preview has an owner: a ticket or a review.** `previews` is rebuilt with its own `id`, a unique nullable
`ticket_id`, a unique nullable `review_id` (cascade on delete of either) and a `project_id` (the per-project cap
counts it without reading the ticket). Exactly one owner is set. The core helpers (`getPreview`, `updatePreview`,
`recordE2e`, `saveGeneratedCompose`, `setComposeOverride`) take a `WorkspaceOwner` (`WorkspaceOwner`, `{ ticketId } | { reviewId }`, in `workspace-owner.ts`).
`container_runs` gets the same: `ticket_id` becomes nullable, `review_id` is added, one of them set. A ticket's
preview, tests and commands behave as today.

**Names.** A review's container is `union-r<reviewId>` (volumes `union-r<id>-home`, `union-r<id>-ws`), its compose
project `union-r<reviewId>`, its hosts `r<reviewId>.localhost` and `<prefix>.r<reviewId>.localhost`. Review ids are
unique across projects, pull request numbers are not. Templates: `{ticket.id}` renders `r<reviewId>` (settings use
it in names, a database name for example, so it must stay unique); add `{pr.number}`, empty for a ticket. The idle
watcher reads routers `union-(t|r)<id>-…`.

**A review has a container of its own, kept with the review.** `ensureReviewContainer` creates `union-r<id>` from
the agent image the first time the review needs it (a preview start, a test run, a command), with the pull request
checked out at `review.headSha` the way the agent review does it, and the project's files synced
(`syncProjectFiles`). Unlike a ticket's, it never gets the Claude credential: nothing runs `claude` in it. It holds
no GitHub token either (`origin` is token-free). It is stopped once nothing runs in it, and removed with the review.
The preview mounts its workspace volume like a ticket's; the compose file is checked and rewritten by the same code
(`composeProblems`, `previewCompose`): it comes from the pull request's author, which is what the checks are for.

**It runs the reviewed commit, not the branch's tip.** The diff on screen, the running code and the tested code are
the same. When the review is reloaded at a newer head, the tab says the checkout is at `abc1234` while the review
reads `def5678`; "Update to the reviewed commit" fetches it and checks it out in the container (`git checkout
--detach`, local changes made by Commands discarded after a confirmation), then restarts the preview if it runs.
The services' named volumes, and so the data, stay unless the user picks "Restart with fresh data" (`down -v`).

**Secrets: never for a fork.** A ticket's code is the agent's; a pull request's may be anyone's. The review stores
`fromFork` when it is added (the list already knows it, `api-types.ts`). A fork's preview starts with the plain
variables only: the secret variables are left unset, there is no way to give them. The start button says whose code
runs ("Runs the code of @author on this machine"), and for a fork, that the secrets are left out. A pull request from
a branch of the repository itself gets them like a ticket (its author can push to the repository already). Commands
and e2e tests never see secrets, for a ticket either (they get the plain variables only).

**Lifecycle.** Same cap as tickets (`UNION_MAX_PREVIEWS`, the project's limit), same idle stop. Removing the review
(alone or with its stack) queues `remove_containers` for `union-r<id>` and its volumes; the worker takes the preview
down first (`PreviewManager.takeDownFor` reads `union-r<id>` too). A merged or closed pull request keeps its
preview until it idles out or the review is removed.

**Stacks.** Each pull request of a stack has its own preview and container; a member's head holds the ones below
it, so the top one's preview shows the whole stack. No stack preview of its own.

## End-to-end tests of a review

The ticket's flow, in the review's container:

- `runRequestedE2e` takes an owner. For a review it ensures `union-r<id>`, starts the preview (or updates it: `up
  --build`), joins the container to the preview's networks (`network.ts` takes the owner's container name),
  installs the browser at the repository's Playwright version (cached in `union-r<id>-home`), runs
  `config.preview.e2eCommand` with `BASE_URL`/`PREVIEW_URL`, and records the result on the preview row
  (`previews.e2e_*`).
- One run at a time across tickets and reviews (`PreviewManager`'s e2e slot holds an owner).
- **Screenshots**: a review has no ticket files. A new table `preview_screenshots` (preview id, name, size), files
  under `reviewFilesDir(reviewId)/e2e/` in Union's data folder, served by the review's preview route and removed
  with the review. Tickets keep theirs as ticket files (the final review reads them).
- **Instead of "Send to agent"**: "Add to review" makes a general draft comment on the review (`review_comments`,
  `kind: 'general'`) with the command, the exit code and the output's last lines in a fenced block, for the user to
  edit before sending. Screenshots are not attached (GitHub's API cannot upload images to a review); the comment
  says how many failed.

## Commands in a review's checkout

The Commands section of the ticket's Preview tab, on the review's Preview tab:

- `container_runs` rows with `review_id`; the same queue rule (one per owner at a time) and the same global limit.
- They run in `union-r<id>` (started for it), in the checkout, as `node`, with the plain variables
  (`config.preview.agentVariables`' choice) and `PREVIEW_URL`/`BASE_URL` while the preview runs. No agent services
  and no `localhost` forwarding in v1 (they start with an implementation step; the preview's services are reachable
  by name once the container joins it).
- Saved scripts are the project's, so the same list shows.
- Output: "Add to review" as for e2e; `for_agent` stays null for a review.
- What a command changes in the checkout (an install, generated files) stays until "Update to the reviewed commit"
  discards it; the tab shows `git status --short` is not clean.

## Commands and API

- Commands `preview_start`, `preview_stop`, `preview_restart`, `preview_logs`, `preview_generate`, `preview_e2e`,
  `review_checkout_update` with `ticket_id` null and payload `{ reviewId }`; `commands.ts` hands
  `hooks.preview(owner, action)`. Container runs keep their own commands (`container_run`, `cancel_container_run`),
  with `reviewId` in place of the ticket.
- `/api/projects/:projectId/pull-requests/reviews/:number/preview` (`GET`, `POST start|stop|restart|logs|e2e|update`,
  `GET compose`, `GET screenshots/:name`) and `…/runs` (list, start, cancel, add to review): the view and refusal
  reasons of `routes/preview.ts` and the container-run routes, moved into modules both owners share (no settings,
  the review's files not read yet, already starting or stopping, a command pending: matched on
  `json_extract(payload, '$.reviewId')`).
- No events: the review page polls the preview and the runs while one is active, like the agent review.

## Steps

1. **Core: owners.** (Built: migration `0054_review_previews`, tested on a copy of the live database; the worker
   fails a review-owned command run and the idle watcher reads tickets' previews only, until steps 2 and 3.)
   Migrations rebuilding `previews` (copy rows, `project_id` from their tickets) and
   `container_runs`; `preview_screenshots`; `current_reviews.from_fork`; helpers on `WorkspaceOwner`;
   `previewProject`/`previewHost`/`previewServiceHost` from an owner; `{pr.number}`; events only for a ticket
   owner. Tests: helpers for both owners, templates, the migrations on a copy of a database with previews and runs.
   Restart `web` and `worker` after it (migrations, several core files).
2. **Worker: the review's container and preview.** `ensureReviewContainer` (checkout at `headSha`, project files, no
   credentials) and the update to a newer commit; `loadTarget` for a review; `PreviewManager` keyed by owner; idle
   regex; `takeDownFor`; secrets left out for a fork (`from_fork` is what the client listed when the review was
   added: the worker checks the pull request's head repository again before a start with secrets). Test against real Docker with a throwaway review row (its
   container and volumes removed after), as for ticket 9001.
3. **Worker: e2e and Commands for a review.** `runRequestedE2e` and the container-run queue on an owner; network
   join by container name; screenshots in `preview_screenshots`. Real Docker test: a command and an e2e command
   (a script that fails and writes a PNG under `test-results`) on the throwaway review.
4. **Web: routes and removal.** The shared preview and run modules; the review's routes; "Add to review" as a draft
   comment; removing a review or a stack queues the container removal. Route tests.
5. **Client: Preview tab on the review page.** The ticket's preview section, e2e section and Commands, given an
   owner (the components take the API base, like `ReviewTarget`); the author line and the fork note on Start; the
   commit notice and "Update to the reviewed commit"; "Add to review" in place of "Send to agent". A dot on the
   review in Current reviews while its preview runs. UI check with `scripts/ui-check/` (writes blocked).
6. **Docs.** `SPEC.md` (Preview environments, Current reviews), `docs/architecture/{core,worker,web,database}.md`,
   this file's status, `docs/plans/README.md`.

## Risks

- The `previews` and `container_runs` rebuilds touch the user's live rows: test the migrations on a copy of
  `union.sqlite` first, and check that running previews still show as running after them.
- Commands and e2e tests run a stranger's code in a fork's case. The container holds no credentials and no secrets,
  and the compose checks still apply; what is left is what any `npm install` of someone's branch does on a laptop.
  The tab says so before the first run on a fork.
- A container and two volumes per review that used one: disk grows with open reviews (a `node_modules` each). The
  review list shows which reviews hold a checkout, and removing the review frees it.
- A pull request may change the compose file so it no longer fits the settings (renamed service): the start fails
  with the services the file has, as for a ticket.
- Reviews and tickets share the preview cap, so a few open reviews can block a ticket's preview. The refusal says
  which previews run.
