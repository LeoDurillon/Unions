# How Union works

You do not need this page to use Union. It explains what runs where, so you can judge what Union does with your
code, your credentials and your Claude usage.

## Processes

```mermaid
flowchart LR
    B[Browser] <-->|HTTP + live events| W[web]
    W -->|commands| DB[(union.sqlite)]
    DB --> K[worker]
    K -->|events| DB
    K <-->|issues, branches, PRs| GH[GitHub]
    K --> D[Docker]
    D --> C1[ticket container]
    D --> C2[ticket container]
    D --> P[previews]
```

- **web** serves the page and an API. It reads the database and streams changes to your browser as they happen. It
  never runs an agent, never starts a container and never writes to GitHub: when you click Start, Approve or
  Retry, it writes a command to the database.
- **worker** handles those commands. It runs each ticket's steps, starts the containers, runs the agents, and does
  every GitHub write: issues, comments, Project status, pushes and pull requests. It reads GitHub every 30 seconds
  for changes made there.
- **union.sqlite** holds everything both share. Restarting the web or the worker never touches running containers.

## Containers

Each ticket gets a container and two volumes: its **workspace** (the repository) and its **home** (the agent's
session, so a revision continues the same conversation). The container stops between steps and starts again for the
next one, and the volumes stay until the ticket is removed. That is why several tickets can run at once without
seeing each other's changes.

Investigations, Explain, agent reviews of pull requests and the lesson writer run in throwaway containers, removed
when they finish.

Inside a container, the agent is the Claude Code CLI (`claude -p`), run with the prompt, model, effort and tools of
its step.

## Credentials

- **Your Claude login**: each container gets the Claude credential from `~/.claude/.credentials.json`, and nothing
  else from your Claude configuration: no history, no MCP logins.
- **GitHub**: tokens and the GitHub App's key stay in the database. They never reach the browser nor the agents'
  containers. The worker clones, fetches and pushes for the agents, from the host. The agents cannot push.
- **Notion**: the integration secret stays in the database, and only the worker writes to Notion.
- **Preview secrets**: kept on the server, given to the preview's services, never to the agent.

Credentials are stored in plain text in `union.sqlite`, like any local application's settings: protect the file
and its backups as you would your tokens.

Agents can still read everything in their container, including the repository. A repository can contain text
written to mislead an agent (a prompt injection): review what agents produce before you merge it, as you would any
contribution.

## Usage and cost

Each step, revision, investigation and Explain is one or more agent runs on your Claude subscription. Union shows
each run's tokens in the Overview, the Log and an investigation's Usage tab, with what the same tokens would cost
on the Anthropic API. A Max subscription does not bill that amount; it helps compare models and steps.

**Claude usage** at the bottom of the sidebar shows how much of your subscription's two windows is used: the
**5 hours** window and the **Week** window, each with a bar and the time it starts over. The bar turns amber from
80% and red at the limit. Union reads these figures from Claude's answers to its own agents, so they update while
an agent runs. What you use elsewhere (Claude Code, claude.ai) shows at the next agent call, and the meter says how
old its figures are when no agent has run for a while. Folded, the sidebar shows the higher of the two shares.

A project's **Usage** tab (beside **Pull requests**) has two tabs, both over the last 7, 30 or 90 days, or since
the start. **Cost** adds up what its agents used: the API-equivalent cost, the agent calls and the tokens, a bar per week (hover one for its
figures), then the cost per step, per model and for the most expensive tickets (click one to open it), with the
investigations on their own line.

**What to improve** (with the number of findings) lists what the agents' logs show over the same range, each with the tickets
that show it most (click one to open it). Each card is marked **Repository** when the fix belongs in your project's
code and docs, or **Union** when it is about how Union runs the agents:

- **Large sessions**: steps whose runs carry a very large context, read again at every turn.
- **Tickets costing far more than the others** and **Many review rounds**: tickets worth a look before the next
  similar one (a smaller ticket, a clearer spec, feedback that settles the open points).
- **Commands that print a lot**: output that stays in the session; ask for less, or add a script that prints only
  what matters.
- **Checks run in many different ways**: the agents work out each time how to run the tests or the linter; one
  script named in the repository's `CLAUDE.md` saves those turns.
- **Files read again on ticket after ticket**: a short note in the `CLAUDE.md` or `AGENTS.md` of their folder can
  spare reading them whole.
- **Changes far larger than their plan**: tickets whose first implementation added over one and a half times the
  lines of code the technical plan estimated (see [The size of a change](ticket-lifecycle.md#the-size-of-a-change)).
- **Commands refused** and **Skills loaded again and again**: tell the agents in `CLAUDE.md` how to write commands,
  or put a skill used on every ticket into `CLAUDE.md`.

Nothing there uses your Claude subscription: it is counted from the logs Union already keeps.

**Suggest improvements**, at the top of that tab, asks an agent what to change for these findings. Click it, then
**Start**: Union starts an investigation (Opus, reading the repository only, on your Claude subscription) with the
findings and the cost per step as its question, and opens it in **Investigations**. Its answer lists changes to the
repository, each written as a ticket you can create from the investigation, changes to Union's settings, and
one-line lessons you can add to the project's **Memory**. Ask follow-up questions there as with any investigation.

To use less:

- pick the **Quick** or **Standard** flow for small tickets;
- use lighter models for the steps that do not need Opus (**Union settings → Models**);
- lower `UNION_MAX_CONCURRENT` to run fewer agents at once.

## What GitHub sees

| In Union            | On GitHub                                                 |
| ------------------- | --------------------------------------------------------- |
| A ticket            | An issue, added to the Project                            |
| The ticket's column | The Project item's **Status**                             |
| A step's output     | One comment on the issue, edited when the step is revised |
| The ticket's branch | `<issue number>-<slug>`, pushed by the worker             |
| The pull request    | A draft pull request that closes the issue                |
| A parent ticket     | The child's issue is "blocked by" the parent's            |

GitHub is the reference for a ticket's title, description and column: change them on GitHub and Union follows.
