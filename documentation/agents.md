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

| Group          | Agents                                                                                  | Default model                   |
| -------------- | --------------------------------------------------------------------------------------- | ------------------------------- |
| General        | **Shared instructions**: sent first to every agent                                      | –                               |
| Planning       | Intake, Summary, Technical, Test plan                                                   | Haiku, Sonnet, Opus, Sonnet     |
| Implementation | Implementation, Final review                                                            | Opus, Opus                      |
| Pull requests  | PR description, Replies to GitHub comments, Rebase, Simplify history, Split plan, Split | The implementer's model, mostly |
| Review         | Review comments, Group by spec, Explain                                                 | Opus, Sonnet, Haiku             |
| Memory         | Lesson writer                                                                           | Haiku                           |

The rebase, simplify history, split, PR description and replies agents continue the implementer's session, so they
run on the implementer's model and effort.

On an agent's page:

- **Prompt**: what the agent is told to do. Keep the structure it asks for (the Intake's `Answer:` lines, the final
  review's verdict line): Union reads it.
- **Model**: Haiku (fastest, uses the least), Sonnet, or Opus (most capable).
- **Effort**: how hard the agent thinks (`low` to `max`). **Default** leaves it to Claude Code.
- **Tools**: what the agent may do. The planning and review agents read; the implementer also edits and runs
  commands.
- **Reset to default** brings back Union's prompt.

**Models** shows every agent's model and effort in one table.

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
- Write, edit, reorder or remove lessons by hand, grouped by step. Up to 500 characters each.
- Nothing is kept until you click **Save**.
- **Send lessons to the agents** turns them off without deleting them.

Lessons never change on their own: the agents read them but never write them, and the lesson writer only runs when
you ask.

## Flows

**Settings → Flows** holds the flow presets a ticket can pick (Full, Standard and Quick to start with) and the one
new tickets get. A preset is a list of planning steps and custom agents; implementation and the final review always
run. See [The board and tickets](tickets.md#flows).
