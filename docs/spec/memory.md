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

- One-line rules (at most 500 characters, 200 per project), grouped by pipeline step (Intake, Summary, Technical,
  Test plan, Implementation, Final review). Added, edited, moved up or down within their step and removed in the
  page's form; one Save writes them all. An empty rule cannot be saved.
- Sent to every run of their step on that project, under `# Lessons from past tickets`, after the shared and project
  instructions. Read on every run, so an edit applies from the next run. A resumed session (Revise on the
  implementation) does not get them again; investigations, reviews of pull requests, rebases and the history
  simplification get none.

## Not built

- Suggesting lessons from the feedback with an agent (it would use the user's Claude usage).
