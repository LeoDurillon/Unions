// A UI check to copy: opens a ticket's Preview tab with its commands stubbed, and prints what it would send.
import { APP_URL, openApp, openTicket } from './browser';

/** Long enough for the blocked request to be recorded. */
const SETTLE_MS = 300;
const TICKET_TITLE = process.argv[2] ?? 'Corriger la duplication des actions';

const { page, writes, close } = await openApp({
  stub: async (route, apiPath, method) => {
    if (method === 'GET' && apiPath.endsWith('/container-runs')) {
      await route.fulfill({ json: { runs: [], refusal: null, canSend: false } });
      return true;
    }
    return false;
  },
});
try {
  await openTicket(page, TICKET_TITLE);
  await page.getByRole('tab', { name: 'Preview' }).click();
  const commands = page.locator('section', {
    has: page.getByRole('heading', { name: 'Commands' }),
  });
  await commands.getByLabel('Command').fill('echo hello');
  await commands.getByRole('button', { name: 'Run', exact: true }).click();
  await page.waitForTimeout(SETTLE_MS);
  console.log(`Checked ${APP_URL}; writes the page tried:`, writes);
} finally {
  await close();
}
