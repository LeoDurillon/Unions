# Plans and ideas

Features discussed but not built yet. Each file says its status; designs already in `SPEC.md` are summarized there
and linked.

## Planned in detail

- [Container commands](container-commands.md): run a command or saved script in a ticket's environment, send its
  output to the implementer. Phases 1 to 3 built (running, output, giving it to the agent, saved scripts); the preview service target left.
- [Ticket groups](ticket-groups.md): the board shows groups of one or more tickets. Decisions to confirm.
- [Split a PR into a stack](pr-stack-split.md): an agent splits a ready-for-review PR into stacked PRs. Needs groups.
- [Restack](restack.md): rebase and retarget a stack after a revision or a merge.
- [MCP servers for agents](mcp-servers.md): claude.ai connectors built (Figma); HTTP and stdio servers left.
- [Preview environments](preview-environments.md): compose-based previews with e2e tests (built, phases 1 to 4).
- [Project settings as a page](project-settings-page.md): grouped side menu instead of the nine-tab modal (steps 1 to 4 built).
- [Group a review's changes by spec](review-spec-groups.md) (built, hunks included): an agent groups the changed files by the parts of
  the spec they implement (PR description, ticket, issue or Notion page), on request; a toggle in the file panel.

## Ideas

- [Prefill steps on GitHub issue import](issue-import-prefill.md)
- [Show older merged tickets](board-older-merged.md)
- [Exclude merged PRs from the ticket view](exclude-merged-prs.md) (scope to clarify)
- [Revise with guidance after a failed rebase](rebase-revise-with-guidance.md)
- [Download attachments from GitHub and Notion on import](attachment-downloads.md) (Notion images done)
- [Events v2](events-v2.md): replay, more actions, filters, group triggers
- [Names in the event rule preview](rule-preview-people.md) (small)

## Chores

- [Reword ticket 5's commit e8825f5](reword-ticket-5-commit.md): moot, its pull request was closed.
