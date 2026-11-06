# Plan: lessons on the right step, without repeats

Status: steps 1 to 3 built (2026-11-06, commits `47c615c` and `8efcd3d`), each checked on a copy of the live
database in headless Chromium with every write blocked. Step 4 planned. Left: the real lesson writer and tidier
seen on Senova (a first tidy run worked as expected, by the user's account).

## Idea

An audit of Senova's 65 lessons (project 1, 2026-11-06) found what the lesson writer and the Memory page let
through:

- **The same rule twice**: the S3 deletion fact in Summary and in Technical; two barrel `index.ts` rules that pull
  against each other (one says `export *`, the other "never helpers"); two error rules (the entity's own error, a
  distinct error per cause); two test fixture rules.
- **The wrong step**: "ask which environment reproduces the bug" in Summary (Intake asks the questions); a label
  migration rule and a display bug diagnosis in Intake (Technical decides those); two test-writing rules in the
  test plan (the implementer writes tests); "the PR targets origin/prod" in the final review, which cannot change a
  ticket's base (Union sets it with `ticketBase`).
- **Contradictions across steps**: Implementation's "no schema changes" against Technical's "no migration unless
  the requester approves" and Intake's "with a database migration". Each step reads only its own lessons, so
  nothing showed it.

Why: the writer saw each step as one line with nothing it cannot do, read the feedback's step as the lesson's,
was told "do not repeat a lesson" once and ran on Haiku with 60 lessons in view. Nothing looked at the lessons
again once saved, and a save deleted and re-inserted them all, so no lesson had an id that lasted.

The Senova list was fixed by hand the same day through `PUT /api/projects/1/lessons` (65 → 62 lessons; the list
before is in the session's scratch folder, not kept), before any of the steps below.

## Step 1: tell the writer where a lesson goes (built)

`packages/core/src/lesson-writer.ts`:

- `STEP_ROLES` says what each step's agent decides and what it cannot do (only Intake asks the user; the final
  review writes no code and cannot change the plans or the target branch; Union, not an agent, sets the branch,
  pushes and opens the pull request).
- `LESSON_PLACEMENT`, in the part of the prompt the user cannot edit: the feedback's step is where the problem was
  seen, not always where the lesson goes; the earliest step that decides the thing; project facts to the step that
  plans with them; final review lessons say what to check; word a lesson for its step; no contradiction with
  another step's lessons.

## Step 2: proposals that replace kept lessons, and ids that last (built)

- `saveLessons` (`lessons.ts`) updates in place: a lesson sent with the id of a kept one keeps it (moved to another
  step included), those without an id are added, kept ones left out are removed. `updatedAt` changes only when the
  section or rule does. `parseLessonsSave` refuses a bad id or two lessons with the same id.
- The writer sees the steps' lessons as `- #<id> [step] rule` and answers
  `{section, rule, replaces, why}` (`LessonProposal`, `lesson-input.ts`). `parseLessonSuggestions` keeps the
  `replaces` that name a kept lesson of a step, and drops a proposal identical to the one lesson it replaces.
  An empty rule with `replaces` removes those lessons.
- The Memory page shows the lessons a proposal replaces struck through, with **Replace** (or **Remove**).
  `withProposal` (core, pure) puts it in place of the first one, keeping its id, and drops the others.
- Fixed on the way: the page's form turned every section that is not a pipeline step into `implement`, so a save
  moved the Spec report's lessons and custom agents' lessons to Implementation. It now keeps every known section.

## Step 3: Tidy lessons (built)

- A **Tidy lessons** button above the lessons queues a `lesson_suggestions` row of kind `tidy` (migration
  `0081_lesson_suggestion_kind`; `POST /api/projects/:id/lesson-tidy`, `queueLessonTidy`). It shares the one
  run a project has at a time with the writer and is refused when the project has no lesson on a pipeline step.
- A new agent `lesson_tidier` (Sonnet by default, read-only tools, Union settings → Memory → Lesson tidier), run
  by the writer's runner (`lesson-writer-run.ts`) in the same throwaway container. Its prompt (`lesson-tidier.ts`)
  has the same steps, placement rules and lesson ids as the writer's. It keeps only proposals that replace
  kept lessons (`parseTidyProposals`). The default prompts of both agents are in `lesson-prompts.ts`.
- The tidier's run shows under its button, the writer's under the feedback (`LessonSuggestions` with `kind`).

## Step 4: checks on the Memory page that cost no Claude usage (planned)

Each part is small and independent. None needs the worker or a migration.

1. **A likely repeat, said when a lesson is added or accepted.** A pure `similarLessons(rule, lessons)` in core
   (browser-safe, `lesson-similarity.ts`): lowercased words of four letters or more, stop words left out, overlap
   over the shorter set; above a threshold (start at 0.6, tune on Senova's list before and after the cleanup),
   the card or the proposal says "Close to: <step>: <rule>". Shown, never blocking. Across steps too: a repeat on
   another step is the case the audit found most.
2. **Each step's role beside its lessons.** Move `STEP_ROLES` where the client can read it (it is already pure, in
   a browser-safe module) and show it under each step's title in `lesson-list.tsx`, so the user sees what the step
   decides before adding a lesson to it.
3. **Change a lesson's step by hand.** A card can only move up or down within its step today. Add a step picker
   to the card's edit mode (`lesson-card.tsx`); the lesson keeps its id (step 2). On a proposal, the same picker
   before **Accept** or **Replace**, so a lesson on the wrong step is fixed without editing it after.
4. **A count per step, with a warning.** The step's title says how many lessons it has; above 25 (Senova's
   Implementation had 33) a line suggests **Tidy lessons**, since every lesson is in every run of that step.

Tests: `similarLessons` on the audit's real pairs (the S3 pair, the barrel pair: both found) and on lessons that
only share a topic (dayjs vs Intl in another sentence: not found); the card's step picker in a UI check that
reads the blocked `PUT` and finds the lesson's id with its new section.

## Left for later

- From the [usage insights plan](usage-insights.md): lessons from a Suggest improvements answer proposed to
  Memory in one click. It can now use `LessonProposal`, `replaces` included.
- A tidy run proposed when the page is opened and a step went over the warning of step 4.4, rather than only on
  the button.
