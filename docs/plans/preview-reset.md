# Reset a preview: drop its containers and data, start fresh

Status: built, steps 1 to 6 (branches `preview-reset` and `preview-reset-folders`, 2026-10-29). Open questions settled as proposed: Reset starts the preview again, Stop
is unchanged, the button is only in the Preview tab.

The user's words: "there's no way to restart completely the container of a preview, so if failed data corrupt the
preview you can't drop it to start on a fresh instance".

## What keeps data today

**Stop** already runs `compose down -v --remove-orphans` (`takeDown`, `apps/worker/src/preview/run.ts`), and a
failed start takes the preview down the same way. Data still survives in these cases:

1. **Restart** (shown while it runs) is only `up -d --build --remove-orphans` again: containers that did not change
   are kept, and every named volume is kept.
2. **Agent services** (`config.agentServices`, a database for the agent's tests) are paused after each step with
   `compose stop` (`pauseAgentServices`, `background.ts`): containers and volumes kept on purpose. The next preview
   start runs `up` in the same compose project (`union-t<id>`) and reuses that database. The preview row says
   `stopped`, so the tab offers no Stop (only `running` and `failed` show it). The user cannot get rid of that data
   from the UI.
3. **Stop during a step** removes only the exposed services (`stopExposedOnly`): the agent's services and their
   volumes stay.
4. **Built images**: `down` does not remove the images compose built (`union-t<id>-web`), and `up --build` reuses
   the build cache, so a bad layer (a broken `node_modules`, a stale generated client) comes back.
5. **Data folders in the workspace**: a bind mount of the repository (`./data:/var/lib/postgresql/data`) becomes a
   subpath of the workspace volume (`workspaceMount`, `preview-compose.ts`). `down -v` never touches it.

## What to build

A **Reset** action on a preview, for a ticket's and a pull request's under review: it removes everything the
preview's compose project holds, then starts it again from nothing. The workspace (the code) is kept.

### Behavior

- **Reset preview** button in the Preview section, next to Start/Restart and Stop, shown whenever the preview has a
  row (running, stopped, failed) or the ticket has agent services. A confirmation says what goes: "Removes the
  preview's containers, volumes (its databases) and the images it built, then starts it again. The code in the
  workspace is kept."
- The worker, in one action under the manager's per-owner lock (so a start and a reset never overlap):
  1. status `stopping`; `leavePreview`.
  2. `compose -p union-t<id> down -v --remove-orphans --rmi local`: every container of the project (agent services
     included), its named volumes, and the images it built (`local` leaves pulled images like `postgres:16`
     alone).
  3. `compose build --no-cache` from the file to run, so no cached layer survives, then the usual start
     (`startTarget`, `joinPreview`, `routeToPreview`). A pull request's preview starts from its checkout as now.
  4. On failure: the same as a failed start (status `failed`, the error and the services' last output kept,
     nothing left running).
- Refused (the web's refusal, checked again by the worker) when:
  - the preview is starting, stopping, or has a preview command pending (`previewRefusal`);
  - a step runs on the ticket (`phase.kind === 'running'`): the agent's database would go away under it. "Wait for
    the step to end, or cancel it";
  - its e2e tests or a command run in that workspace.
- Restart keeps its meaning (update in place, data kept); the button's title says so, to tell it apart from Reset.
- The ticket's log gets a `preview_reset` event ("Preview reset: containers, volumes and built images removed"),
  so a later failure reads in context. A pull request's preview has no events, as now.

### Data folders in the workspace (step 3, optional)

The folders of case 5 are part of the checkout, so they are not removed by default. After the first steps, the
confirmation lists the compose file's workspace mounts that git ignores entirely (`git check-ignore` on each
subpath, in the owner's container) and offers a box per folder: "Also empty `data/` (ignored by git)". A tracked
folder (`./src:/app/src`) is never offered. Built: the folders are found at each start (`previews.data_folders`), so
a preview never started since offers none.

## Steps

1. **Worker**: `apps/worker/src/preview/reset.ts` (`run.ts` is at 290 lines): `resetPreview(deps, owner)` reusing
   `takeDown`'s network leave and `startPreview`, with `--rmi local` and the `build --no-cache` before `up`. Add
   `reset` to `PreviewAction` (`command-hooks.ts`), `preview_reset: 'reset'` to the command map (`commands.ts`), the
   action in `ACTIONS` (`manager.ts`), the step guard. Declare `preview_reset` in `event-payloads.ts`. Unit tests
   with the fake runtime: the compose arguments in order, a failure leaves `failed` and nothing running, refused
   during a step.
2. **Web**: `POST /reset` in `routes/preview.ts` and `routes/review-preview.ts`, with `resetRefusal` in
   `preview-subject.ts` (and `resetRefusal` in `PreviewView` so the button shows why it is disabled). Route tests
   for each refusal.
3. **Client**: the button and its confirmation in `preview-section.tsx` (241 lines: put the actions row in its own
   component if it grows), `calls.reset` in `preview-target.ts`/`use-preview.ts`. A UI check under
   `scripts/ui-check/` that clicks Reset with the writes blocked and prints the command it would send.
4. **Real Docker** (ticket 9001, `docs/architecture/testing.md`): a compose file with a `postgres` named volume as
   an agent service; write a row, pause the services, reset, check the row is gone and `docker image ls` no longer
   lists `union-t9001-*` built images before the rebuild. Clean up `union-*` after.
5. **Docs**: `docs/spec/preview-environments.md` (a bullet on Reset vs Restart vs Stop),
   `documentation/previews.md` ("Start over with a fresh preview": what to click, what is removed, what is kept),
   `docs/architecture/worker.md`, this file's status and the plans index.
6. Optional: the ignored data folders (above).

## Open questions

- Reset on the sidebar's **Previews** page too, or only in the tab? Proposed: only in the tab (it needs a
  confirmation and the preview's context).
- After a reset of a preview that was stopped: start it again, or leave it stopped and clean? Proposed: start it,
  since the point is a fresh running instance; a "Reset" that only cleans is Stop plus the agent services, which
  Stop could also do (see below).
- Should **Stop** also remove the paused agent services when no step runs (case 2), so Stop always means "nothing
  left"? That costs the agent its test data between steps, which `pauseAgentServices` keeps on purpose. Proposed:
  leave Stop as is; Reset is the explicit way.
