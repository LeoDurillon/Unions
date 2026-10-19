# Testing

Three levels, cheapest first. Say in your report which ones ran.

## 1. Unit tests (`bun test`)

Pure logic next to its source as `*.test.ts`: the state machine, prompts, parsing, routes (`createApp(db)` on
`createDb(':memory:')` + `migrateDb`), worker code with a fake `ContainerRuntime` (an object with the methods the code
calls, cast `as unknown as ContainerRuntime`; see `apps/worker/src/container-run.test.ts`).

`scripts/test-preload.ts` (preloaded by `bunfig.toml`) points `UNION_ATTACHMENTS_DIR` at a temporary folder for the
whole run: in-memory databases number projects and tickets from 1, so a test that removes one would otherwise delete the
live `attachments/p1` or `t1`. A test that sets its own folder puts the previous value back afterwards, never
`delete`s it. Run `bun test` from the repository root so the preload applies.

## 2. Real Docker

For anything that runs in a container (exec, process groups, networks, compose, port forwarding), fakes are not
enough: run it once against Docker. The pattern, as a throwaway script outside the repository (your scratch folder),
importing the repository's code by absolute path:

```ts
import { runIn } from '<repo>/apps/worker/src/container-exec.ts';
import { DockerCli } from '<repo>/packages/core/src/docker-cli.ts';
import { createDb, migrateDb, schema } from '<repo>/packages/core/src/index.ts';

const runtime = new DockerCli();
const db = createDb(':memory:'); // never the live union.sqlite
migrateDb(db);
const projectId = db
  .insert(schema.projects)
  .values({ owner: 'scratch', repo: 'scratch', config: { baseBranch: 'main' } })
  .returning()
  .get().id;
db.insert(schema.tickets)
  .values({
    id: 9001,
    projectId,
    title: 'scratch',
    body: '',
    phase: { kind: 'done' },
    workspaceVolume: 'union-t9001-ws',
  })
  .run();
const name = 'union-t9001';
try {
  await runtime.create({
    name,
    image: 'union-agent:local',
    homeVolume: 'union-t9001-home',
    workspaceVolume: 'union-t9001-ws',
  });
  await runtime.start(name);
  await runIn(runtime, name, ['sh', '-c', 'mkdir -p /workspace/repo/.git']); // skips the clone
  // … the code under test (a runner with config { image, gitBaseUrl: 'file:///nowhere', credentialsPath: <a dummy
  // {"claudeAiOauth":{"accessToken":"x"}} file> }) …
} finally {
  // compose services of the scratch ticket, then its container, volumes and networks
  // docker ps -aq --filter label=com.docker.compose.project=union-t9001 | xargs -r docker rm -fv
  await runtime.remove(name, { home: 'union-t9001-home', workspace: 'union-t9001-ws' });
}
```

- Always ticket id **9001** (`union-t9001-*`): never a real ticket's container, volumes or compose project.
- Clean up in `finally`, then check nothing is left:
  `docker ps -a --format '{{.Names}}' | grep 9001; docker volume ls -q | grep 9001; docker network ls --format '{{.Name}}' | grep 9001`.
- Write probes as files copied into the container (`runtime.writeFile`) rather than `node -e "…"` inside a shell
  string: quoting breaks. In Node, print before exiting with a callback (`process.stdout.write(text, () => …)`) or set
  `process.exitCode`: `console.log` then `process.exit` can lose the line on a pipe.
- A service just started is not listening yet: retry for a few seconds rather than failing at once.

## 3. UI checks (Playwright)

`scripts/ui-check/browser.ts` opens the running app (`UNION_UI_URL`, default `http://localhost:5173`) in headless
Chromium (`UNION_CHROMIUM`, else the newest `~/.cache/ms-playwright/chromium_headless_shell-*`; install one with
`bunx playwright-core install chromium-headless-shell`). `openApp({ stub })` lets GETs reach the live API unless
`stub` answers them, and never lets a write through: each one is recorded in `writes` and refused (or answered by
`stub`). So a check can click Save or Run on the real data without changing anything. Copy
`scripts/ui-check/example.ts` (run: `bun scripts/ui-check/example.ts`) into your scratch folder and adapt it.

- Assert with locators and the recorded `writes`; take a screenshot only to judge layout, and look at one at most
  (`locator.screenshot()` of the part that changed, not the whole page).
- Open a ticket by clicking its card's text (`openTicket(page, title)`); tabs by role (`getByRole('tab', …)`).
- `hasText` matches case-insensitively and inside descendants: to pick a row by its label, match the label element
  exactly (`locator('span.w-24', { hasText: /^Branch$/u })`).
- Stub data that does not exist on the live instance (runs, outputs) rather than creating it.
