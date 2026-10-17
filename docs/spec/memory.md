# Memory

What the agents learn from the user's feedback, per project: kept in the database (`feedback_events`, `lessons`),
shown in project settings → Agents → **Memory**.

## Feedback

- Every Revise with text (a planning step, the implementation, a final review, a Done ticket sent back, a refused
  commit) records a `feedback_events` row: the project, the ticket, the step it was given on and the text.
- The Memory page lists the newest 200, new ones first (step, ticket, date, the text clamped to three lines, opened on
  click). **Show curated** lists the others too.
- Each new feedback can be:
  - **Make a lesson**: adds a lesson to the form, on the feedback's step, drafted from its first line. The feedback
    is curated when the page is saved (not before: Discard leaves it new).
  - **Dismiss**: curated at once, no lesson.
- A curated one has **Back to new**.

## Lessons

- **Send lessons to the agents** (on by default, `projects.config.memory`): turned off, no agent gets the lessons.
  They stay on the page, editable, and feedback is still recorded. Saved with the page's Save
  (`PATCH /api/projects/:id` with `memory`).
- Rules of one paragraph (at most 500 characters, 200 per project), grouped by pipeline step (Intake, Summary,
  Technical, Test plan, Implementation, Final review). Each is a card showing its whole text, wrapped. The pencil
  opens a multiline field (Enter, Escape or the check closes it; closed empty, the lesson is removed). Added, moved
  up or down within their step and removed in the page's form; one Save writes them all.
- Sent to every run of their step on that project, under `# Lessons from past tickets`, after the shared and project
  instructions. Read on every run, so an edit applies from the next run. A resumed session (Revise on the
  implementation) does not get them again; investigations, reviews of pull requests, rebases and the history
  simplification get none.

## Manual by design

Nothing changes the lessons on its own. Feedback is recorded automatically; a lesson exists only when the user writes
one (or makes one from a feedback) and saves the page. Agents read the lessons but never write them.

## Not built

- Suggesting lessons from the feedback with an agent (it would use the user's Claude usage).
