# Memory

What the agents learn from the user's feedback, per project: kept in the database (`feedback_events`, `lessons`),
shown in project settings → Agents → **Memory**.

## Feedback

- Every Revise with text (a planning step, the implementation, a final review, a Done ticket sent back, a refused
  commit) records a `feedback_events` row: the project, the ticket, the step it was given on and the text.
- The Memory page lists the newest 200, new ones first (step, ticket, date, the text clamped to three lines, opened on
  click). **Show curated** lists the others too.
- Each new feedback can be:
  - **Make a lesson**: adds a lesson to the form, on the feedback's step, drafted from its first line, and opens it
    for editing, scrolled into view. The feedback is curated when the page is saved (not before: Discard leaves it
    new).
  - **Suggest with agent**: the lesson writer reads this feedback (see below).
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

## Lesson writer

- **Suggest lessons from new feedback** (every new feedback, the newest 60 at most) or **Suggest with agent** on one
  feedback queues a run of the `lesson_writer` agent (`lesson_suggestions`, one at a time per project). It runs only
  on that click: it uses the user's Claude usage.
- The worker runs it in a throwaway container with only the Claude login (no repository), on Haiku by default; its
  prompt, model, effort and tools are in Union settings → Memory → Lesson writer. Its prompt holds the steps, the
  lessons kept (not to repeat them) and the feedback, fenced as data: text quoted from code reviews is never read as
  instructions. It answers a JSON array of `{section, rule}`: none, one or several lessons per feedback.
- The page shows the run (polled while it works), then its proposals: **Accept** one, **Accept all**, or
  **Dismiss** the run. An accepted proposal joins the lessons in the form, and the run's feedback is curated when the
  page is saved. Nothing is kept before Save. A worker stopped during a run fails it; the user asks again.
- Not recorded in token usage: the run belongs to no ticket or investigation.

## Manual by design

Nothing changes the lessons on its own. Feedback is recorded automatically; a lesson exists only when the user writes
one, makes one from a feedback, or accepts one the lesson writer proposed, and saves the page. Agents read the
lessons but never write them, and the lesson writer runs only when the user asks.
