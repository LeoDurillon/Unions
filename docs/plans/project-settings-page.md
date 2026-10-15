# Plan: project settings as a page

Status: steps 1 to 5 built (from step 4, the deep link from a ticket's Preview section only); step 6 (a shared
"Union settings" area) not started. The layout below is as built, with the sections added since
(Files, compose additions, profiles, agent services).

## Why

The project settings are a modal (`settings-dialog.tsx`, `max-w-lg`) with nine tabs: General, Instructions, Checks,
Pull requests, Review, Preview, Notion, Events, Danger zone.

- Two of them are small features of their own: **Events** (rule editor, preview, recent activity) and **Preview**
  (services, variables, secrets, env file), the largest files of `components/settings/` (about 200 to 240 lines
  each, plus helpers). They are cramped in a narrow dialog.
- Agent settings and GitHub App are already full pages; project settings are the exception.
- The pane registry (`settings-panes.tsx`) is at the lint limit on imports: Events and Preview come in through
  re-exports from unrelated files (`notion-section.tsx`, `pull-request-section.tsx`).
- Nothing can link to a given setting: a ticket's Preview section cannot send you to "set up previews", a failed
  event rule cannot open its rule.

## Options

|                                                                                       | Effort                     | Result                                                               |
| ------------------------------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------------- |
| A. Keep the modal, group the tabs (four groups with sub-tabs)                         | Small                      | A shorter tab row; the rule editor and preview settings stay cramped |
| B. Several modals (Events and Preview get their own, opened from where they are used) | Medium                     | Each fits its content, but there is no single place for settings     |
| C. A project settings page with a side menu                                           | Medium, mostly moving code | Room for the big sections, linkable, consistent with the other pages |

Recommended: **C**.

## Layout

A page like Agent settings: a side menu on the left, a readable column on the right, one page per entry.

- **Project**
  - General: GitHub access, base branch
  - Files: the project files put in every workspace
- **Agents**
  - Instructions
  - Checks: install command, check command, iteration limit
- **Pull requests**
  - Pull requests: draft PR toggle
  - Review: ignored files
- **Previews**
  - Services: compose file, compose additions, profiles, services to open, services for the agent
  - Variables: plain variables with templates, secrets, env file (needs Services first)
  - End-to-end tests (needs Services first)
- **Notion**
  - Connection
  - Event rules (needs the connection first)
  - Rule activity: the recent writes to Notion
- **Danger zone**, at the bottom, set apart

## Steps

1. **Routing.** A `settings` page with the section in the URL (`?settings=preview-variables`), handled like
   `?ticket=` (`use-selected-ticket.ts`), so reload and back/forward work and anything can link to a section. The
   project bar's Settings button opens it; `useNavigation` gains the page.
2. **Move the sections into the page as they are**, no behaviour change. A small registry lists the sections and
   their groups; it replaces the import-limit re-exports.
3. **Split the two big ones**: Preview into Services and Variables, Events into Rules and Activity.
4. **Deep links**: "Set up previews" in a ticket's Preview section → Previews → Services; a failed rule delivery →
   Event rules; the setup wizard's last step → "More settings".
5. **One way to save.** Today some sections save with a button and others immediately (secrets, toggles, Notion
   connect). Each page gets one Save, a visible "unsaved changes" state, and a warning before leaving; actions that
   are immediate by nature (removing a secret, deleting the project) stay immediate.
6. **Later, optional**: Agent settings and GitHub App under the same shell as "Union settings", beside the project's,
   so there is one settings area with two scopes.

Steps 1 to 3 are mostly moving components, with no backend change. Step 5 touches every section and is the only
one with design decisions.

## As built

- `?settings=<section>` (`lib/settings-sections.ts`, over `lib/url-state.ts`, which `?ticket=` uses too):
  `openSettings(section)` from anywhere opens the page and closes an open ticket; going to another page or project
  closes it. `components/main-area.tsx` shows `settings/settings-page.tsx` instead of the board.
- Two registries (`project-section-body.tsx`, `integration-section-body.tsx`) replace the pane registry and its
  re-exports. The three preview pages share `preview-form.tsx`: each starts from the saved settings and saves the
  whole configuration, so the other pages' fields go back unchanged.
- Not done from step 4: links from a failed rule delivery (Log tab) and from the setup wizard's last step.
- Step 5: every page with fields has one sticky Save bar (`save-bar.tsx`: unsaved state, Discard, Save) over
  `lib/use-settings-form.ts`; `lib/leave-guard.ts` asks before leaving a page with changes (menu, Back to the
  board, another page or project, investigate, browser back/forward, reload). The draft PR toggle now waits for
  Save. Scripts are edited in the page's list (Done, Remove) and the list is saved with the page; Save is refused
  while one is open. The Notion connection's Save is "Verify and save". Left immediate, with a leave warning for
  what is typed and not sent: the GitHub token and installation (verified before stored), preview secrets, file
  uploads, event rules (each rule is a record with its own editor; its on/off switch applies at once), Turn
  previews off, Disconnect, Delete project.

## Decisions open

- **Step 6** (a shared "Union settings" area): decided later.
