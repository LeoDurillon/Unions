# Agents, flows and memory

Every agent Union runs has a prompt, a model, a thinking effort and a list of tools. Union ships with defaults for
all of them; change them when your projects need it.

Some settings apply to every project (**Union settings**, at the bottom of the sidebar), others to one project
(the project's **Settings**):

| Setting                           | Where                               | Applies to    |
| --------------------------------- | ----------------------------------- | ------------- |
| Prompts, models, effort and tools | Union settings → one page per agent | Every project |
| Custom and review agents          | Union settings → **New agent**      | Every project |
| Tools list and connectors         | Union settings → Tools, Connectors  | Every project |
| Project instructions              | Settings → Instructions             | One project   |
| Lessons (memory)                  | Settings → Memory                   | One project   |
| Flows                             | Settings → Flows                    | One project   |

Changes apply from the next run, including on tickets already running.

## The agents

| Group          | Agents                                                 | Default model               |
| -------------- | ------------------------------------------------------ | --------------------------- |
| General        | **Shared instructions**: sent first to every agent     | –                           |
| Planning       | Intake, Summary, Technical, Test plan                  | Haiku, Sonnet, Opus, Sonnet |
| Implementation | Implementation, Final review                           | Opus, Opus                  |
| Size           | Trim                                                   | Implementation's            |
| Pull requests  | PR description, Replies to GitHub comments, Split plan | Opus, Opus, Opus            |
| Branch history | Rebase, Simplify history, Split into a stack           | Implementation's            |
| Review         | Review comments, Group by spec, Explain, Spec report   | Opus, Sonnet, Haiku, Opus   |
| Memory         | Lesson writer, Lesson tidier                           | Haiku, Sonnet               |

Rebase, Simplify history, Split into a stack and Trim are only prompts: the implementation agent runs them in its
own session, with the Implementation model and effort. Trim is sent when a first implementation adds far more lines of
code than its plan estimated (see [Ticket lifecycle](ticket-lifecycle.md#the-size-of-a-change)). A change of target and a restack use the Rebase prompt the same
way.

PR description and Replies to GitHub comments also continue the implementer's session, but they have a model and
effort of their own. They start on Opus and stay there when you change Implementation's model: change theirs too if
you want them to follow.

Three kinds of runs have no page in Union settings:

- **Investigations**, and the tickets written from them with **Create ticket**: you pick the model and tools in the
  investigation's form (Opus, reading the code and the web, to start with), and the ticket is written on the same
  model. See [Investigations](investigations.md).
- **The prompt writer** writes a custom agent's prompt from its role, on Sonnet, when you create the agent or click
  **Regenerate**.
- **Read connectors** and **Check again** (Union settings → Connectors) only read your connectors: no model runs, so
  they use none of your Claude usage.

On an agent's page:

- **Prompt**: what the agent is told to do. A few prompts ask for an answer Union reads: keep that part when you
  edit them (see [What Union reads from an answer](#what-union-reads-from-an-answer)).
- **Model**: Haiku (fastest, uses the least), Sonnet, or Opus (most capable).
- **Effort**: how hard the agent thinks (`low` to `max`). **Default** leaves it to Claude Code.
- **Tools**: what the agent may do. The planning and review agents read; the implementer also edits and runs
  commands.
- **Reset to default** brings back Union's prompt.

**Models** shows every agent's model and effort in one table.

### What Union reads from an answer

Five prompts ask for a format that Union reads back. If you edit one of these prompts, keep its format: the
agent's page warns you under the prompt when your edit drops it. You can still save it.

- **Intake**: an `Answer:` line under each question. Each becomes a box where you answer the question. Without
  these lines you have nowhere to answer.
- **Technical**: a last line `Estimated size: <n> lines of code`. It becomes the ticket's size budget. Without it
  the ticket gets the project's budget, if you set one.
- **Final review**: a first line `VERDICT: APPROVED` or `VERDICT: CHANGES_REQUESTED`. The ticket shows it as the
  verdict. Without it you only get the review's text.
- **Split plan**: one `## Slice <n>: <title>` section per slice, each with a `**Spec:**` paragraph, and at least two
  slices. If Union cannot read the plan, it asks the agent once more, then the step fails.
- **Split into a stack**: a `Slice: <n>` line at the end of each commit message. Union uses it to put each commit in
  its slice. A commit without it is sent back to the agent.

The other formats Union reads are added after your prompt, so you can rewrite those prompts freely: the PR
description, review comments, groups, explanations, replies, lessons, and a commit a git hook refused.

## Tools and connectors

**Union settings → Tools** lists the tools agents and investigations pick from: Claude Code tools (`Read`, `Edit`,
`WebFetch`…) and permission rules such as `Bash(pnpm *)`. Add your own there, then select them on an agent's page.

Some things stay refused whatever you allow: agents never push, and they never hold GitHub credentials.

**Union settings → Connectors** lists the connectors of your claude.ai account (Figma, for example). Selecting one
on an agent gives that agent all its tools. The connector's login stays with Anthropic: nothing about it is copied
into the container.

## Custom agents

**Union settings → New agent** asks first what kind of agent you want. You cannot change the kind later.

- **Ticket step**: a step of a ticket's flow, for example "Check the plan for security risks".
- **Review agent**: an agent you run yourself on a review page, for example "Say whether this pull request can be
  merged".

For either kind:

1. Give it a name and a role, in your own words.
2. An agent writes the prompt from that role, in the style of the built-in ones. The page says "Writing the
   prompt…" until it is done. Read the prompt before you use the agent.
3. **Regenerate** writes the prompt again from the role.

Ticket steps are listed under **Custom agents** in Union settings, review agents under **Review agents**.

### Ticket steps

Place the agent in a flow (**Settings → Flows**, or a ticket's Custom flow), anywhere before the final review.

It runs like a planning step: its report is a tab, you approve it or ask for changes, it gets a comment on the
issue, and the steps after it read its approved report. It reads the code but never changes it. Placed after the
implementation, it reads the branch's diff.

**Delete** is refused while a flow or an unfinished ticket uses the agent.

### Review agents

A review agent runs when you ask, from **Run agent** on the review page of a pull request or of a ticket's branch.
It reads the review's specs, the change and its commits, and answers in markdown. A file it names, like
`src/app.ts:12-30`, opens that part of the diff when you click it.

It works in its own copy of the change, which is thrown away when it finishes:

- The project's files and its install command are set up first, so the agent can run commands there: build, type
  checks, lint, tests. Your ticket's workspace is never touched.
- It cannot push or post anything to GitHub.
- On a pull request from a fork, nothing is installed and the agent is told not to run the fork's code: it only
  reads it.

Its tools start with Bash, so it can run those commands. It can never edit files.

**Delete** is refused while one of its runs waits or runs. The answers it already gave stay on the review pages.

## Project instructions

**Settings → Instructions** is free Markdown that every agent of the project reads, after the shared instructions:
conventions, where things live, commands to use, what never to touch. Investigations read it too.

## The agent image

The agents work in a container made from an image that has Node, Bun, pnpm and yarn, git, the Claude CLI and what
Playwright's browsers need. When your project needs more (Python, Go, Java, a system library, a database client),
give it its own image in **Settings → Agents → Agent image**:

- **Default image**: what every project starts with.
- **Dockerfile**: write one that starts with `FROM union-agent`, switch to `USER root` to install what you need, and
  end with `USER node`. The page starts you with an example.
- **Existing image**: the name of an image you built yourself on top of `union-agent` and pushed to a registry.

Click **Save and build**. Union builds the image (or pulls it), then checks that the agents can still work in it:
the Claude CLI runs, git is there, the user is `node` with its home folder. The build log shows under the editor
while it runs. The new image is used only once the check passes: until then, and if it fails, the agents keep the
image they had, and the page says why. **Cancel the build** stops it; **Drop this change** forgets a save that
failed.

Tickets move onto the new image at their next step; a step already running finishes on the old one. Investigations
and agent reviews of the project use it too.

Good to know:

- The Dockerfile is built without your repository's files: `COPY` works only from another stage of the same
  Dockerfile. Install what you need with `RUN`.
- The Dockerfile lives in Union's settings, not in your repository, so an agent cannot change the image it runs in.
- When Union's own image is updated, your Dockerfile is built again on it the first time a ticket needs it.

## Memory

Every time you ask for a revision with text, Union records it as **feedback**: the project, the ticket, the step and
what you wrote. **Settings → Memory** turns feedback into **lessons**: short rules that the agents of a step read on
every run of this project.

- On a feedback: **Make a lesson** (drafted from its first line, for you to edit), **Suggest with agent**, or
  **Dismiss**.
- **Suggest lessons from new feedback** asks the lesson writer agent for proposals. **Accept** or dismiss each one.
  The writer puts each lesson on the step whose agent must act on it, which is not always the step you gave the
  feedback on: a question to ask goes to Intake, a fact about your infrastructure to Technical. It can also propose
  to fix lessons you already have: merge two that say the same thing, move one to the right step, or reword two
  that contradict each other. Such a proposal shows the lessons it replaces, struck through; **Replace** puts it in
  their place.
- **Tidy lessons**, above the lessons, asks the lesson tidier to read all your saved lessons and fix them: merge the
  ones that repeat each other, move a lesson to the step that must act on it, reword lessons that contradict each
  other, remove the ones that only held for one ticket. Each change says why. **Replace** or **Remove** applies it to
  the list, **Dismiss** drops them all. It uses your Claude usage, and runs one at a time with the lesson writer.
- Write, edit, reorder or remove lessons by hand, grouped by step. Up to 500 characters each. The last group,
  **Spec report**, holds the rules the spec report reads: the ones you keep when you mark an item of its **Needs
  you** not useful, and any you add (for example "Flag a page shared by loan and subsidy campaigns").
- Nothing is kept until you click **Save**.
- **Send lessons to the agents** turns them off without deleting them.

Lessons never change on their own: the agents read them but never write them, and the lesson writer and the tidier
only run when you ask.

## Flows

**Settings → Flows** holds the flow presets a ticket can pick (Full, Standard and Quick to start with) and the one
new tickets get. A preset is a list of planning steps and custom agents; implementation and the final review always
run. See [The board and tickets](tickets.md#flows).
