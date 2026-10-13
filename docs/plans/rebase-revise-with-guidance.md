# Idea: revise with guidance after a failed rebase

Status: specified in `SPEC.md` (Rebase section, marked "Not yet"). Not built.

Today a failed rebase puts the branch back as it was and the ticket in `failed` at the `rebase` step; the user can
retry. The missing part: a **Revise** action that sends the rebase back to the agent with guidance first, for example
"keep our version of the API client", so a conflict the agent resolved the wrong way can be redone as the user wants.

Shape: from `failed` (step `rebase`), a revise action with a message; the rebase run resumes the implementer's session
with the rebase prompt plus that guidance. Needs a state machine transition and a test in `states.test.ts`.
