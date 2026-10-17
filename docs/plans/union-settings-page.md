# Union settings as a page

Status: built, steps 1 and 2 (branch `union-settings`, 2026-10-17). Step 6 of
[Project settings as a page](project-settings-page.md).

## Why

The global settings are two sidebar pages, Agent settings (`agents/agents-page.tsx`) and GitHub App
(`github-app/github-app-page.tsx`):

- The open page is React state (`lib/use-navigation.ts`), not the URL: a reload goes back to the board, and nothing
  can link to one agent's prompt.
- Agent settings is one scroll: the tool list, the connectors, then twelve cards, each with its own Save, Discard and
  Reset, and no warning before leaving with unsaved edits. The project settings have one sticky Save bar and the
  leave guard.
- Shared instructions is listed as an agent, though it is the global counterpart of the project's Instructions.
- The MCP servers registry (SPEC: "Agent settings → MCP servers") would make the scroll longer.

## Decisions

- Two separate areas: Union settings and the project's settings each keep their own page, with the same shell. No
  scope switch, so Union settings do not need a selected project.
- One menu entry per agent, grouped.
- The reorganisation first; the Models page is a later step.

## Step 1: the reorganisation

Menu (the id is what `?union=` holds):

- **General**: Shared instructions (`shared`)
- **Planning**: Intake, Summary, Technical, Test plan
- **Implementation**: Implementation, Final review
- **Pull requests**: PR description, Rebase, Simplify history
- **Review**: Review comments, Group by spec
- **Tools**: Tools, Connectors (MCP servers later, here)
- **GitHub**: GitHub App

Running previews stay a page of their own: they are state, not settings.

Changes, client only:

1. `lib/union-settings-sections.ts`: the groups, `useUnionSection()`, `openUnionSettings(section)` and
   `closeUnionSettings()` over `lib/url-state.ts` and `confirmLeave()`, like `lib/settings-sections.ts`. Agent
   entries derive from `AgentId` and `AGENT_LABELS`, so a new agent gets its entry.
2. The page shown moves to the URL as well (`?page=previews|union`), so a reload keeps it. `useNavigation` reads it;
   going to a project or the board closes either settings area. The sidebar's two links become one **Settings**.
3. The shell: `SettingsNav` and the page frame take their groups, open section and open function as props; the
   project settings pass theirs, Union settings theirs. `main-area.tsx` shows `UnionSettingsPage` for `?union=`.
4. One agent per page: `AgentCard` becomes `AgentPage` over `use-settings-form` and `SaveBar` (prompt, model, effort,
   tools; one Save; Discard from the bar). Reset to default stays on the page as an immediate action. The remount key
   in `agents-page.tsx` goes away: the page is keyed by section. Shared instructions uses the same page without
   model, effort or tools.
5. Tools and Connectors move as they are (adding and removing a tool stays immediate). GitHub App moves as it is.
6. Links: the project's Instructions page links to Union settings → Shared instructions; the project's GitHub access
   section links to Union settings → GitHub App where it mentions the app.

No backend change. Delete `agents-page.tsx` and `github-app-page.tsx`'s page frame once moved; run `bun run map`.

Checks: `bun run check`; a UI check (`scripts/ui-check/`) that opens each entry, edits a prompt, sees the leave
warning, reloads on a deep link.

## Step 2: the Models page

**General → Models**: a table, a row per agent with a model (all but Shared instructions), its model and effort as
the same fields as the agent page. Rebase and Simplify history show "uses Implementation's" instead of fields. One
Save bar; Save calls `api.saveAgent` for each changed row, with that agent's saved prompt and tools unchanged. The
agent pages keep their model and effort fields.

Decided: one `PUT /api/agents/:agent` per changed row, sent together, no new route. A failed one shows its error and
the agents are read again, so the table shows what was saved; Save again sends what is left.

## As built (step 1)

- The sidebar link is **Union settings**, not Settings: the project bar already has a Settings button.
- `lib/union-settings-groups.ts` lists the pages; `components/union-settings/union-section-labels.test.ts` fails
  when an agent of `AGENT_LABELS` has no page. The client checks agent ids against `AGENT_LABELS`
  (`isAgentId` in `agent-labels.ts`): the core index is not browser-safe.
- Reset to default is disabled while the page has unsaved changes.
- Not done: a link from the project's GitHub access section, which sets the app up in place
  (`installation-picker.tsx`) and does not point at the page.
- Checked with UI checks (writes blocked): every entry, a deep link after a reload, the leave warning, Save sending
  one `PUT /api/agents/:agent`, `?page=previews` kept on reload, the project settings menu, and the Instructions
  link to Shared instructions with back.

## As built (step 2)

- `components/union-settings/models-page.tsx` over `lib/use-models-form.ts`. The model and effort fields take an
  `ariaLabel` that replaces their visible label in the table (`Technical model`, `Technical effort`).
- Rows follow the menu's order (`menuIndex`). Rebase and Simplify history show Implementation's choice as edited.
- Checked with a UI check (writes blocked): the eleven rows, Rebase following an edited Implementation model, Save
  sending only the two changed rows, each with its saved prompt and its tools (null when they are the defaults).
