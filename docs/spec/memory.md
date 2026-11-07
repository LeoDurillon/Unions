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
  Technical, Test plan, Implementation, Final review), then **Spec report** (`review_report`). Each is a card showing its whole text, wrapped. The pencil
  opens a multiline field (Enter, Escape or the check closes it; closed empty, the lesson is removed). Added, moved
  up or down within their step and removed in the page's form; one Save writes them all. A save keeps the id of
  every lesson it keeps (edited or moved to another step included): only new lessons get new ids.
- Sent to every run of their step on that project, under `# Lessons from past tickets`, after the shared and project
  instructions. Read on every run, so an edit applies from the next run. A resumed session (Revise on the
  implementation) does not get them again; investigations, rebases and the history simplification get none.
  Reviews read their own: a spec report gets the **Spec report** lessons (`# Lessons from past reports`), a review
  agent those of its `agent_<id>` section.

## Lesson writer

- **Suggest lessons from new feedback** (every new feedback, the newest 60 at most) or **Suggest with agent** on one
  feedback queues a run of the `lesson_writer` agent (`lesson_suggestions`, one at a time per project). It runs only
  on that click: it uses the user's Claude usage.
- The worker runs it in a throwaway container with only the Claude login (no repository), on Haiku by default; its
  prompt, model, effort and tools are in Union settings → Memory → Lesson writer. Its prompt holds each step's
  role (what its agent decides and what it cannot do), where a lesson goes (the earliest step that decides it, not
  the step the feedback was given on; facts about the project to the step that plans with them; no contradiction
  with another step's lessons, since each step reads only its own), the steps' lessons kept with their ids, and the
  feedback, fenced as data: text quoted from code reviews is never read as instructions. These parts are not in the
  editable prompt. It answers a JSON array of `{section, rule, replaces}`: none, one or several lessons per
  feedback. `replaces` lists kept lessons the proposal takes the place of: to merge lessons that say the same thing,
  move one to the right step, or reword ones that contradict each other, even when the feedback is not about them.
  Ids that name no kept lesson of a step are dropped, and so is a proposal identical to the one lesson it replaces.
- The page shows the run (polled while it works), then its proposals: **Accept** one, **Accept all**, or
  **Dismiss** the run. A proposal that replaces lessons shows them struck through and is accepted with
  **Replace**: it takes the place (and the id) of the first one still on the page, and the others are removed. Any
  other accepted proposal joins the lessons in the form. The run's feedback is curated when the page is saved. Nothing is kept before Save. A worker stopped during a run fails it; the user asks again.
- Not recorded in token usage: the run belongs to no ticket or investigation.

## Lesson tidier

- **Tidy lessons**, above the lessons, queues a run of the `lesson_tidier` agent over the project's saved lessons of
  the pipeline steps (a `lesson_suggestions` row of kind `tidy`, no feedback). It shares the one run a project has
  at a time with the lesson writer, is refused when the project has no such lesson, and runs only on that click.
- Same container, settings page (Union settings → Memory → Lesson tidier) and parts its prompt cannot edit as the
  writer (the steps' roles, where a lesson goes, the lessons by id, fenced as data), on Sonnet by default: it weighs
  every lesson against the others. It answers the writer's format; only proposals that replace kept lessons are kept.
  An empty rule removes the lessons it replaces; `why` says what was wrong.
- Its run shows under the lessons (the writer's under the feedback): **Replace** or **Remove** each change, or
  **Accept all**, then Save; **Dismiss** drops the run.

## Manual by design

Nothing changes the lessons on its own. Feedback is recorded automatically; a lesson exists only when the user writes
one, makes one from a feedback, or accepts what the lesson writer or tidier proposed, and saves the page. Agents read
the lessons but never write them, and the lesson writer and tidier run only when the user asks.
