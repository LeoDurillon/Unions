# Plan: read stacks from GitHub instead of grouping them by branch

Status: planned (2026-10-20), decisions to confirm. Follows [Stacked PRs in Pull requests and Current
reviews](stacked-pr-reviews.md) and [Split a PR into a stack](pr-stack.md).

## Idea

The Pull requests and Current reviews tabs, the stack agent review and the stack's Notion link find stacks by
chaining branches (`B.baseBranch === A.headBranch`, `packages/core/src/pr-stacks.ts`). GitHub now has real stacks
(the worker already creates, unstacks and polls them: `apps/worker/src/github/octokit-stacks.ts`). Read them
instead: a stack is what GitHub says it is, bottom first, with every member, even those outside the newest 100 or
already merged.

## GitHub's API (REST, `X-GitHub-Api-Version: 2026-03-10`)

- `GET /repos/{o}/{r}/stacks`: every stack of the repository, `per_page` up to 100, `page`. No state filter: each
  stack has `open`. `?pull_request=<n>` gives the one stack holding that pull request.
- `GET /repos/{o}/{r}/stacks/{number}`: one stack.
- Each stack: `number`, `open`, `base.ref`, `pull_requests` bottom first, each with `number`, `state`, `draft`,
  `merged_at`, `head.ref`, `head.sha` (the list's shape; `get` adds `title`, `base`, `user`).
- A 404 on the list means the host has no stacks (GitHub Enterprise Server), as the worker already handles.
- No GraphQL field for stacks in the docs: one REST call per page, beside the GraphQL list of pull requests.

## What changes

### Core

- Move the raw stack's guard and mapping (`isRawStack`, `stackOf`, the API version header) out of the worker into
  `packages/core/src/github-stacks.ts`, shared by the worker's `OctokitStacks` and the web's reads. `GitHubStack`
  moves with it (re-exported from the worker's `api.ts`).
- `packages/core/src/pr-stacks.ts` gains `githubStackGroups(pulls, stacks)`: the pulls grouped by the open stacks
  that hold them, in the stack's order; a pull in no stack is a stack of one. Pure, tested with the cases of
  `pr-stacks.test.ts` that still apply (stack of one, two stacks, a member not in the list, a closed stack ignored).
  `pullRequestStacks` stays for the fallback (decision 1).

### Web: reading

- `OnboardingGitHub` gains `listStacks(auth, repo): Promise<GitHubStack[] | null>` (null on 404: no stacks on this
  host) and `pullRequestStack(auth, repo, number): Promise<GitHubStack | null>`, in a new `github-stacks.ts`
  (`github-onboarding.ts` is at 298 lines). Pages of 100, up to 5 (named constant), open stacks kept; under the
  web's GitHub call deadline like the other reads.
- `routes/pull-requests.ts`: the list and the stacks are read together (`Promise.all`) and cached together in
  `PullRequestCache` (Refresh reads both). Each `PullRequestListItem` gets `stack: { number, position, size } |
  null`, and the response gets `stacks: { number, base, members: StackMemberRef[] }[]` so a member outside the
  listed 100 can still be named (`#11, not listed`).

### Web: Current reviews

- Migration: `current_reviews.github_stack_number` (integer, null) and `stack_position` (integer, null).
- Filled when a pull request is added (`POST /reviews`, `POST /reviews/stack`: the list item carries its stack)
  and written back each time `pr-review-load.ts` reads the files, as it already does for the branches: one more
  call, `pullRequestStack(number)`. A pull request unstacked on GitHub leaves the stack on the next read.
- `reviewStacks` (client) groups by `githubStackNumber`, ordered by `stackPosition`; `reviewStackBottoms` keys by
  stack number instead of head branch. "Joins the stack of #12" becomes: the list item's stack has a member under
  review.
- `routes/pr-agent-review.ts` `stackReviews`: the stack is read from GitHub at start (the route already re-reads
  every member's files), and the numbers sent must be its open members under review, bottom first; else 400 as
  today. `routes/review-notion.ts` `linkedReviews`: the reviews with the same `githubStackNumber`.

### Client

- `pull-request-stacks.ts`: `splitStacks` uses the items' `stack`; under Closed and All the stacks group too
  (GitHub keeps merged members in the stack), a merged member shown with its state.
- `stack-item.tsx`: the size counts the listed members; members not listed show as a line with their number and
  state from the stack. "Stack of 3" comes from the stack's own size.
- A stack that is a split ticket's (`tickets.github_stack_number`) shows **Open ticket** on the stack row, not per
  member.

### Worker

- Only the shared mapping moves (core). Behavior unchanged.

## What it fixes

- Forks: a fork's branch named like one of ours no longer joins a stack (the known limit of the earlier plan,
  without a `cross_repository` column).
- A member outside the newest 100 no longer makes the stack look shorter.
- A ticket-linked member in the middle no longer splits a stack in Current reviews into two: the stack is one
  number; the linked member shows as a link to its ticket in the picker, not as a tab to review (decision 3).
- Stacks of two pull requests on the same one (a fork in the chain) are no longer guessed into a flat order.

## Decisions to confirm

1. **Branch-chained pull requests that are not a GitHub stack** (made by hand, or by another tool): recommended,
   group them only when the host has no stacks (the list's 404), with `pullRequestStacks` as today; on github.com
   they show as single pull requests. Alternative: show them under "Stacks" too, marked "by branch", with an
   action to make them a GitHub stack (`POST /stacks`: a write, so a command for the worker).
2. **Current reviews: stored or read live.** Recommended: stored stack number and position, refreshed on each
   files read (the tab opens without GitHub). Reading live each time would cost a call per open of the tab.
3. **Ticket-linked member in a stack under review:** recommended, the review page's picker shows it disabled,
   "#13 · reviewed in its ticket", so the stack's order stays whole.
4. **Pages of stacks:** recommended, up to 500 stacks (5 pages); a repository past that loses the oldest ones,
   noted in the list like the 100 pull requests.

## Delivery

Each step passes `bun run check`; web steps reload only the web (no worker restart until step 1).

1. Core `github-stacks.ts` (shared mapping, moved from the worker) and `githubStackGroups` with tests. Worker
   imports from core. Check `bun run active` before saving: it reloads the worker.
2. Web reads: `listStacks`, `pullRequestStack`, the fake in tests, the list route and cache, the list item's
   `stack`. Tests in `pull-requests.test.ts` with the fake (stack, 404 fallback, member not listed).
3. Pull requests tab on the new fields: `splitStacks`, `stack-item.tsx`, the ticket's stack row.
4. Migration and Current reviews: fill and refresh the columns, group by them, `pr-agent-review.ts` and
   `review-notion.ts`. Restart `web worker` after the migration (`bun run active` first).
5. Spec: `docs/spec/pull-requests.md` and `docs/spec/pr-stacks.md` say where stacks come from;
   `docs/architecture/web.md` and `integrations.md` list the new reads; mark this plan built.

Verify against a real repository read-only (no writes): the Pull requests tab on a repo with a GitHub stack from
an earlier split. UI checks block writes (`scripts/ui-check/`).
