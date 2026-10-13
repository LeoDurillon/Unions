# Idea: prefill steps when importing a GitHub issue Union already worked on

Status: idea, not started.

## Today

Importing a GitHub issue (`apps/web/src/routes/issue-import.ts`) reads only its title and body. The new ticket starts
at Intake with no step outputs, even if Union worked on that issue before (for example after a database reset).

What Union leaves on an issue:

- One comment per step, starting with a hidden marker `<!-- union:ticket=12 step=summary -->`, then a heading
  `### Summary · v2 · approved` and the step's latest content, revision feedback in a folded section
  (`apps/worker/src/github/render.ts`).
- A trailing `<!-- union:ticket=12 -->` marker in the issue body.

Side effects of re-importing such an issue today:

1. **Duplicate step comments.** The worker finds its comments by a marker containing the ticket id
   (`github/sync.ts`, `findComment`); the new ticket has a new id, so it posts a second set.
2. **Leftover body marker.** The old marker stays in the ticket description; after the next sync it is no longer at
   the end of the body (the only place `stripTicketMarker` removes it), so agents see it in their prompt.

## Design

- On import, list the issue's comments and keep those with a Union step marker.
- Read step, version, status and content from each, and save them as that step's output (approved ones as approved).
- Start the ticket waiting for approval at the first step that is not approved, or at the next step.
- Strip the old body marker; let the worker adopt the old comments (match by step marker regardless of ticket id, or
  rewrite the marker) instead of posting new ones.

## Limits

- A comment holds only the latest version of a step and the feedback text; earlier versions are lost.
- Implementation is the hard case: its comment is only the agent's description, the work is the branch and PR.
  Prefill Intake to Test plan, then start at Implementation awaiting approval. Later: re-link the branch and PR by name.
