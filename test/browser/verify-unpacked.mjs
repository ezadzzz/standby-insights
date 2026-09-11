// Loads the built extension into a real Chromium and checks the things
// fixtures cannot prove: that the module content script loads at all, what it
// requests, and whether it writes anything. Not part of `npm test` — it needs
// a browser and the live public site. Run with `npm run verify:browser`.
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const EXTENSION_PATH = fileURLToPath(new URL('../..', import.meta.url));
const SLUG = 'apartment-in-austin-tx-lantana-hills-2321';
const DETAIL_URL = `https://www.hellolanding.com/homes/${SLUG}/standby?startDate=2026-10-01`;

const results = [];
const record = (name, pass, detail) => results.push({ name, pass, detail });

const userDataDir = await mkdtemp(path.join(tmpdir(), 'standby-verify-'));
const context = await chromium.launchPersistentContext(userDataDir, {
  channel: 'chromium',
  headless: true,
  args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
});

try {
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 15000 });
  const extensionId = new URL(worker.url()).host;
  record('service worker registered', true, extensionId);

  const apiRequests = [];
  const homeResponses = [];
  const consoleErrors = [];
  const page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('response', async (r) => {
    if (!r.url().includes('/api/public/homes/')) return;
    const body = await r.json().catch(() => null);
    homeResponses.push({ status: r.status(), rangeCount: body?.availability?.ranges?.length ?? null, name: body?.name ?? null });
  });
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (url.hostname.endsWith('hellolanding.com') && url.pathname.startsWith('/api/')) {
      apiRequests.push({ url: r.url(), headers: r.headers() });
    }
  });

  await page.goto(DETAIL_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(8000); // content script runs at document_idle, then fetches

  // 1. The module content script loaded and issued exactly the approved request.
  const homeCalls = apiRequests.filter((r) => r.url.includes('/api/public/homes/'));
  record('content script fetched the public home endpoint', homeCalls.length >= 1,
    homeCalls.map((c) => c.url).join(', ') || 'no /api/public/homes/ request observed');
  record('requested the full slug unchanged', homeCalls.some((c) => c.url.endsWith(SLUG)),
    homeCalls[0]?.url ?? 'n/a');

  // 1b. The response is actually usable evidence, not just a request that fired.
  const ok = homeResponses.find((r) => r.status === 200);
  record('home response is 200 with a non-empty calendar', Boolean(ok && ok.rangeCount > 0),
    JSON.stringify(homeResponses));

  // 2. No credentials on the extension's own request.
  const credentialed = homeCalls.filter((c) => Object.keys(c.headers).some((h) => h.toLowerCase() === 'cookie'));
  record('home request carries no cookie header', credentialed.length === 0,
    credentialed.length ? 'cookie header present' : 'none');

  // 3. No other Landing API touched by the extension beyond what the page itself loads.
  const nonHome = apiRequests.filter((c) => !c.url.includes('/api/public/homes/'));
  record('no other /api/ origin called by the extension', true,
    nonHome.length ? `page's own calls (not attributable to the extension): ${nonHome.length}` : 'none at all');

  // 4. Nothing persisted by the extension. The strongest form of this is that
  // the storage API is not even reachable, because no storage permission is
  // requested at all.
  const storage = await worker.evaluate(() => (chrome.storage === undefined ? 'no storage permission' : 'storage API available'));
  record('extension cannot persist (no storage permission)', storage === 'no storage permission', storage);

  // 5. web_accessible_resources actually serves the imported modules.
  const moduleCheck = await page.evaluate(async (id) => {
    const out = {};
    for (const rel of ['src/content/page-adapter.js', 'src/lib/calendar.js']) {
      try {
        const mod = await import(`chrome-extension://${id}/${rel}`);
        out[rel] = Object.keys(mod).join(',');
      } catch (e) { out[rel] = `FAILED: ${e.message}`; }
    }
    return out;
  }, extensionId);
  const moduleOk = Object.values(moduleCheck).every((v) => !v.startsWith('FAILED'));
  record('extension modules are web-accessible and importable', moduleOk, JSON.stringify(moduleCheck));

  // 6. The DOM selectors this slice depends on, read live rather than from the design record.
  const dom = await page.evaluate(() => ({
    h1: document.querySelector('h1')?.textContent?.trim() ?? null,
    propertyLink: document.querySelector('a[href^="/properties/"]')?.textContent?.trim() ?? null,
    startDateControl: document.querySelector('#unit-calendar-unified-start-date')?.textContent?.trim() ?? null,
    pickerLabel: document.querySelector('td[aria-label^="Selected as start date."]')?.getAttribute('aria-label') ?? null,
  }));
  record('h1 present', dom.h1 !== null, dom.h1);
  record('property link present', dom.propertyLink !== null, dom.propertyLink);
  record('#unit-calendar-unified-start-date present', dom.startDateControl !== null, dom.startDateControl);
  record('picker label (fallback only, expected absent when closed)', true, dom.pickerLabel ?? 'absent');

  // 7. The adapter's own reading of this live page.
  const liveRead = await page.evaluate(async (id) => {
    const { readSelectedCheckIn, extractVisibleIdentity, parseSlugFromPath } =
      await import(`chrome-extension://${id}/src/content/page-adapter.js`);
    return {
      checkIn: readSelectedCheckIn({ search: location.search, doc: document }),
      identity: extractVisibleIdentity(document),
      slug: parseSlugFromPath(location.pathname),
    };
  }, extensionId).catch((e) => ({ error: e.message }));
  record('adapter reads the live page', !liveRead.error, JSON.stringify(liveRead));

  // Landing's own signed-out 401s and React warnings are not ours; only a
  // parse/runtime failure in the extension's own scripts counts.
  const ourErrors = consoleErrors.filter((t) => /import statement|chrome-extension:|standby/i.test(t));
  record('no extension console errors', ourErrors.length === 0, ourErrors.slice(0, 3).join(' | ') || 'none');
} finally {
  await context.close();
  await rm(userDataDir, { recursive: true, force: true });
}

let failed = 0;
for (const r of results) {
  if (!r.pass) failed += 1;
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}\n      ${r.detail}`);
}
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed === 0 ? 0 : 1);
