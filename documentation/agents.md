# Agents, flows and memory

Every agent Union runs has a prompt, a model, a thinking effort and a list of tools. Union ships with defaults for
all of them; change them when your projects need it.

Some settings apply to every project (**Union settings**, at the bottom of the sidebar), others to one project
(the project's **Settings**):

| Setting                           | Where                               | Applies to    |
| --------------------------------- | ----------------------------------- | ------------- |
| Prompts, models, effort and tools | Union settings → one page per agent | Every project |
| Custom agents                     | Union settings → **New agent**      | Every project |
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
| Pull requests  | PR description, Replies to GitHub comments, Split plan | Opus, Opus, Opus            |
| Branch history | Rebase, Simplify history, Split into a stack           | Implementation's            |
| Review         | Review comments, Group by spec, Explain, Spec report   | Opus, Sonnet, Haiku, Opus   |
| Memory         | Lesson writer                                          | Haiku                       |

Rebase, Simplify history and Split into a stack are only prompts: the implementation agent runs them in its own
session, with the Implementation model and effort. A change of target and a restack use the Rebase prompt the same
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

Four prompts ask for a format that Union reads back. If you edit one of these prompts, keep its format: the
agent's page warns you under the prompt when your edit drops it. You can still save it.

- **Intake**: an `Answer:` line under each question. Each becomes a box where you answer the question. Without
  these lines you have nowhere to answer.
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

Add a step of your own, for example "Check the plan for security risks":

1. **Union settings → New agent**: a name and a role, in your own words.
2. An agent writes the prompt from that role, in the style of the built-in ones. The page says "Writing the
   prompt…" until it is done.
3. Place the agent in a flow (**Settings → Flows**, or a ticket's Custom flow), anywhere before the final review.

A custom agent runs like a planning step: its report is a tab, you approve it or ask for changes, it gets a comment
on the issue, and the steps after it read its approved report. It reads the code but never changes it. Placed after
the implementation, it reads the branch's diff.

**Regenerate** writes the prompt again from the role. **Delete** is refused while a flow or an unfinished ticket
uses the agent.

## Project instructions

**Settings → Instructions** is free Markdown that every agent of the project reads, after the shared instructions:
conventions, where things live, commands to use, what never to touch. Investigations read it too.

## Memory

Every time you ask for a revision with text, Union records it as **feedback**: the project, the ticket, the step and
what you wrote. **Settings → Memory** turns feedback into **lessons**: short rules that the agents of a step read on
every run of this project.

- On a feedback: **Make a lesson** (drafted from its first line, for you to edit), **Suggest with agent**, or
  **Dismiss**.
- **Suggest lessons from new feedback** asks the lesson writer agent for proposals. **Accept** or dismiss each one.
- Write, edit, reorder or remove lessons by hand, grouped by step. Up to 500 characters each. The last group,
  **Spec report**, holds the rules the spec report reads: the ones you keep when you mark an item of its **Needs
  you** not useful, and any you add (for example "Flag a page shared by loan and subsidy campaigns").
- Nothing is kept until you click **Save**.
- **Send lessons to the agents** turns them off without deleting them.

Lessons never change on their own: the agents read them but never write them, and the lesson writer only runs when
you ask.

## Flows

**Settings → Flows** holds the flow presets a ticket can pick (Full, Standard and Quick to start with) and the one
new tickets get. A preset is a list of planning steps and custom agents; implementation and the final review always
run. See [The board and tickets](tickets.md#flows).
