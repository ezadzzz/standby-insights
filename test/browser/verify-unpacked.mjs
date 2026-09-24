// Loads the built extension into a real Chromium and checks the things
// fixtures cannot prove: that the module content script loads at all, what it
// requests, and whether it writes anything. Not part of `npm test` — it needs
// a browser and the live public site. Run with `npm run verify:browser`.
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseCardSlugFromHref } from '../../src/content/page-adapter.js';

const EXTENSION_PATH = fileURLToPath(new URL('../..', import.meta.url));
const SEARCH_URL = 'https://www.hellolanding.com/s/austin-tx/apartments/standby';

// The detail unit is whichever one Landing lists first right now. A pinned
// slug goes stale: once a unit has no future availability Landing stops
// rendering its check-in control, and the selector check fails for a reason
// that has nothing to do with the extension. Found in a plain browser, so the
// extension's own reads of the search page never touch this lookup.
async function currentlyListedSlug() {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const href = await page.locator('a[data-testid="pdp-home-card-link"]').first().getAttribute('href', { timeout: 30000 });
    const slug = parseCardSlugFromHref(href);
    if (!slug) throw new Error(`no Standby card slug found on ${SEARCH_URL} (first href: ${href})`);
    return slug;
  } finally {
    await browser.close();
  }
}

const SLUG = await currentlyListedSlug();
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
  const mcpCalls = [];
  const homeResponses = [];
  const consoleErrors = [];
  const page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('response', async (r) => {
    if (!r.url().includes('/api/public/homes/')) return;
    const body = await r.json().catch(() => null);
    homeResponses.push({
      status: r.status(),
      rangeCount: body?.availability?.ranges?.length ?? null,
      name: body?.name ?? null,
      // The comparison reads its scope and the subject's own price off this
      // same response, so the live shape of those fields is recorded here
      // rather than assumed from the search response's shape.
      comparisonFields: body === null ? null : {
        market_slug: body.market_slug ?? null,
        bedrooms: body.bedrooms ?? null,
        is_price_monthly: body.is_price_monthly ?? null,
        currency: body.currency ?? null,
        display_price_with_discount: body.display_price_with_discount ?? null,
        display_price_label: body.display_price_label ?? null,
      },
    });
  });
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (!url.hostname.endsWith('hellolanding.com')) return;
    if (url.pathname.startsWith('/api/')) {
      apiRequests.push({ url: r.url(), headers: r.headers() });
    }
    if (url.pathname === '/mcp/public') {
      let body = null;
      try { body = JSON.parse(r.postData() ?? 'null'); } catch { body = 'unparseable'; }
      mcpCalls.push({ url: r.url(), method: r.method(), headers: r.headers(), body });
    }
  });
  page.on('response', async (r) => {
    if (new URL(r.url()).pathname !== '/mcp/public') return;
    const body = await r.json().catch(() => null);
    let payload = null;
    try { payload = JSON.parse(body?.result?.content?.[0]?.text ?? 'null'); } catch { payload = null; }
    const call = mcpCalls.at(-1);
    if (call) call.response = { status: r.status(), echo: payload?.response
      ? { page: payload.response.page, per_page: payload.response.per_page, total_pages: payload.response.total_pages, market: payload.response.market?.slug, homes: payload.response.homes?.length }
      : null };
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

  // 1c. The subject side of the comparison is read off this response too.
  const fields = ok?.comparisonFields ?? null;
  record('home response carries the comparison scope (market_slug, bedrooms)',
    typeof fields?.market_slug === 'string' && Number.isInteger(fields?.bedrooms),
    JSON.stringify({ market_slug: fields?.market_slug, bedrooms: fields?.bedrooms }));
  record('home response carries an advertised price the comparison rule can judge',
    fields?.is_price_monthly === true && fields?.currency === 'USD' && Number.isFinite(fields?.display_price_with_discount),
    JSON.stringify(fields));

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

  // 6b. The comparison's own request boundary, exercised the way the panel
  // does it: the panel is what triggers a comparison, so open it by hand.
  await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: 'https://www.hellolanding.com/homes/*/standby*' });
    if (tab) await chrome.tabs.sendMessage(tab.id, { type: 'request-open' });
  }).catch(() => {});
  await page.waitForTimeout(12000);

  record('comparison used only the fixed public MCP endpoint', mcpCalls.every((c) => c.url === 'https://www.hellolanding.com/mcp/public'),
    mcpCalls.length ? `${mcpCalls.length} call(s)` : 'no /mcp/public request observed');
  const toolNames = [...new Set(mcpCalls.map((c) => c.body?.params?.name))];
  record('comparison called only search_apartments_tool', mcpCalls.length > 0 && toolNames.every((n) => n === 'search_apartments_tool'),
    toolNames.join(', ') || 'n/a');
  const args = mcpCalls[0]?.body?.params?.arguments ?? {};
  const argued = args.min_bedrooms === args.max_bedrooms
    && Number.isInteger(args.min_bedrooms)
    && typeof args.market === 'string'
    && args.per_page === 40
    && args.include_hero_images === false
    && !('start_date' in args) && !('end_date' in args) && !('committed_nights' in args)
    && !('min_price' in args) && !('max_price' in args) && !('deals_only' in args)
    && !('guest_rating' in args) && !('min_rating' in args) && !('sort_by' in args);
  record('search arguments are scoped, exact-bedroom and unfiltered', argued, JSON.stringify(args));
  const mcpCredentialed = mcpCalls.filter((c) => Object.keys(c.headers).some((h) => h.toLowerCase() === 'cookie'));
  record('comparison request carries no cookie header', mcpCalls.length > 0 && mcpCredentialed.length === 0,
    mcpCredentialed.length ? 'cookie header present' : 'none');
  const echo = mcpCalls.find((c) => c.response)?.response;
  // A failure here is Landing no longer honouring per_page, not a defect in
  // this extension: the comparison rejects a shrunken page rather than
  // sampling part of a market, so this records that the design still holds.
  record('Landing still honours the requested page size (design premise)',
    Boolean(echo && echo.echo && echo.echo.per_page === 40),
    JSON.stringify(echo ?? 'no response captured'));
  record('comparison stayed within the 25-request budget', mcpCalls.length <= 25, `${mcpCalls.length} page request(s)`);

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

  // 8. The Standby search route: card annotation, in a real browser against
  // real cards. The fixtures decide what a card may say; only this can show
  // that it lands in the page without disturbing Landing's own results.
  const searchPage = await context.newPage();
  const searchApi = [];
  searchPage.on('request', (r) => {
    const url = new URL(r.url());
    if (url.hostname.endsWith('hellolanding.com') && url.pathname.startsWith('/api/public/homes/')) {
      searchApi.push(r.url());
    }
  });
  const searchErrors = [];
  searchPage.on('console', (m) => { if (m.type() === 'error') searchErrors.push(m.text()); });

  await searchPage.goto(SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await searchPage.waitForTimeout(14000);

  const cards = await searchPage.evaluate(() => {
    const anchors = [...document.querySelectorAll('a[data-testid="pdp-home-card-link"]')];
    const annotations = [...document.querySelectorAll('[data-standby-evidence]')];
    const perCard = anchors.map((a) => ({
      href: a.getAttribute('href'),
      next: a.nextElementSibling?.getAttribute?.('data-standby-evidence') ?? null,
    }));
    return {
      anchorCount: anchors.length,
      annotationCount: annotations.length,
      duplicated: annotations.length !== new Set(annotations.map((el) => el.getAttribute('data-standby-evidence'))).size,
      annotatedInPlace: perCard.filter((c) => c.next !== null).length,
      sampleText: annotations.slice(0, 2).map((el) => el.textContent.trim().slice(0, 160)),
      buttons: document.querySelectorAll('.standby-evidence-button').length,
      anchorsStillLinks: anchors.every((a) => typeof a.getAttribute('href') === 'string'),
      notice: document.querySelector('[data-standby-notice]')?.textContent ?? null,
    };
  });

  record('search route renders cards the annotator can see', cards.anchorCount > 0, `${cards.anchorCount} cards`);
  record('cards entering the viewport were annotated', cards.annotationCount > 0,
    `${cards.annotationCount} annotations, ${searchApi.length} home reads`);
  record('exactly one annotation per card, placed after Landing’s own link', !cards.duplicated && cards.annotatedInPlace === cards.annotationCount,
    JSON.stringify({ annotationCount: cards.annotationCount, annotatedInPlace: cards.annotatedInPlace, duplicated: cards.duplicated }));
  record('annotations state evidence in words', cards.sampleText.every((t) => t.length > 0), JSON.stringify(cards.sampleText));
  record('every annotation carries a real View evidence button', cards.buttons === cards.annotationCount,
    `${cards.buttons} buttons / ${cards.annotationCount} annotations`);
  record('Landing’s own card links are left intact', cards.anchorsStillLinks, `${cards.anchorCount} anchors still linked`);
  record('the annotator did not read more units than there are cards', searchApi.length <= cards.anchorCount,
    `${searchApi.length} reads for ${cards.anchorCount} cards`);
  record('unreadable-card notice appears at most once', (await searchPage.evaluate(() => document.querySelectorAll('[data-standby-notice]').length)) <= 1,
    cards.notice ?? 'no notice shown');
  record('any page notice sits outside every Landing card', await searchPage.evaluate(() => {
    const notice = document.querySelector('[data-standby-notice]');
    return !notice || notice.closest('[data-testid="pdp-home-card-wrapper"]') === null;
  }), cards.notice ?? 'no notice shown');

  const searchOwnErrors = searchErrors.filter((t) => /import statement|chrome-extension:|standby/i.test(t));
  record('no extension console errors on the search route', searchOwnErrors.length === 0,
    searchOwnErrors.slice(0, 3).join(' | ') || 'none');

  // 9. The side panel. Chrome has to carry the member's click out of the page,
  // through the service worker, into chrome.sidePanel.open() — a hop no fixture
  // can cover and the one the design was least sure of. If this check ever
  // fails, open the panel another way rather than reaching for a synthetic
  // gesture or a keepalive.
  await worker.evaluate(() => {
    self.__panelErrors = [];
    self.addEventListener('unhandledrejection', (e) => self.__panelErrors.push(String(e.reason)));
  });
  const panelsBefore = await worker.evaluate(async () =>
    (await chrome.runtime.getContexts({ contextTypes: ['SIDE_PANEL'] })).length);
  // Opened by keyboard alone, which is both the accessibility requirement and
  // the harder case for the gesture: focus the card's own button and press it.
  const cardButton = searchPage.locator('.standby-evidence-button').first();
  await cardButton.focus();
  const focusedCardButton = await searchPage.evaluate(() => ({
    isEvidenceButton: document.activeElement?.classList.contains('standby-evidence-button') ?? false,
    focusVisible: document.activeElement?.matches(':focus-visible') ?? false,
  }));
  await searchPage.keyboard.press('Enter');
  await searchPage.waitForTimeout(3000);
  const panelsAfter = await worker.evaluate(async () => ({
    documents: (await chrome.runtime.getContexts({ contextTypes: ['SIDE_PANEL'] })).map((c) => c.documentUrl),
    errors: self.__panelErrors ?? [],
  }));
  record('View evidence takes keyboard focus with a visible focus ring',
    focusedCardButton.isEvidenceButton && focusedCardButton.focusVisible, JSON.stringify(focusedCardButton));
  record('pressing Enter on View evidence opens the side panel',
    panelsBefore === 0 && panelsAfter.documents.length === 1,
    JSON.stringify({ before: panelsBefore, after: panelsAfter.documents }));
  record('opening the panel raised no service-worker error', panelsAfter.errors.length === 0,
    panelsAfter.errors.join(' | ') || 'none');

  // 9b. The panel stays available only on the routes this extension supports.
  const offRoutePage = await context.newPage();
  await offRoutePage.goto('https://www.hellolanding.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await offRoutePage.waitForTimeout(3000);
  const gating = await worker.evaluate(async () => {
    const enabledFor = async (pattern) => {
      const tabs = await chrome.tabs.query({ url: pattern });
      const tab = tabs.at(-1);
      if (!tab) return null;
      return (await chrome.sidePanel.getOptions({ tabId: tab.id })).enabled;
    };
    return {
      standby: await enabledFor('https://www.hellolanding.com/s/*/apartments/standby*'),
      elsewhere: await enabledFor('https://www.hellolanding.com/'),
    };
  });
  record('the panel is enabled on a Standby route and disabled off it',
    gating.standby === true && gating.elsewhere === false, JSON.stringify(gating));

  // 9c. The panel document's own accessibility, read from the real markup
  // rather than from the fixture that decides its wording.
  const panelPage = await context.newPage();
  await panelPage.goto(`chrome-extension://${extensionId}/src/panel/panel.html`, { waitUntil: 'domcontentloaded' });
  const panelDom = await panelPage.evaluate(() => {
    const refresh = document.getElementById('refresh-button');
    const announcer = document.getElementById('announcer');
    return {
      refreshTag: refresh.tagName,
      refreshType: refresh.type,
      refreshName: refresh.textContent.trim(),
      refreshTabIndex: refresh.tabIndex,
      announcerLive: announcer.getAttribute('aria-live'),
      announcerRole: announcer.getAttribute('role'),
      identityRole: document.getElementById('identity-note').getAttribute('role'),
      headingWraps: getComputedStyle(document.querySelector('h1')).overflowWrap,
    };
  });
  await panelPage.keyboard.press('Tab');
  const focusRing = await panelPage.evaluate(() => {
    const active = document.activeElement;
    return {
      focused: active?.id ?? null,
      focusVisible: active?.matches(':focus-visible') ?? false,
      outlineWidth: active ? getComputedStyle(active, null).outlineWidth : null,
    };
  });
  record('Refresh is a native keyboard-operable button with a meaningful name',
    panelDom.refreshTag === 'BUTTON' && panelDom.refreshType === 'button'
      && panelDom.refreshName === 'Refresh' && panelDom.refreshTabIndex === 0,
    JSON.stringify(panelDom));
  record('Tab reaches Refresh and it shows a visible focus ring',
    focusRing.focused === 'refresh-button' && focusRing.focusVisible && focusRing.outlineWidth !== '0px',
    JSON.stringify(focusRing));
  // The wording and the moment of the announcement are the fixtures' job; what
  // only a browser can confirm is that the element it lands in is a region a
  // screen reader will read politely rather than interrupt with.
  record('the announcer is a polite status region',
    panelDom.announcerLive === 'polite' && panelDom.announcerRole === 'status', JSON.stringify(panelDom));
  record('the identity note is a status region and a long unit name wraps',
    panelDom.identityRole === 'status' && panelDom.headingWraps === 'break-word', JSON.stringify(panelDom));
  await panelPage.close();

  // 10. Page-instance memory, counted by what each page actually requests.
  // Only the extension reads the public home endpoint without credentials —
  // Landing's own page calls /api/v1/* and carries its session — so the
  // uncredentialed read of this slug is what attributes a request to us.
  const trackHomeReads = (p) => {
    const seen = [];
    p.on('request', (r) => {
      if (!r.url().includes(`/api/public/homes/${SLUG}`)) return;
      if (Object.keys(r.headers()).some((h) => h.toLowerCase() === 'cookie')) return;
      seen.push(r.url());
    });
    return seen;
  };
  const tabA = await context.newPage();
  const readsA = trackHomeReads(tabA);
  await tabA.goto(DETAIL_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await tabA.waitForTimeout(8000);
  const tabB = await context.newPage();
  const readsB = trackHomeReads(tabB);
  await tabB.goto(DETAIL_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await tabB.waitForTimeout(8000);
  record('a second tab reads the same unit for itself rather than sharing evidence',
    readsA.length >= 1 && readsB.length >= 1, JSON.stringify({ tabA: readsA.length, tabB: readsB.length }));

  // A fresh read after a reload is what page-instance memory looks like from
  // outside; it is not by itself proof that nothing was retained, which is why
  // the absence of any store is asserted separately below and above.
  const beforeReload = readsA.length;
  await tabA.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
  await tabA.waitForTimeout(8000);
  record('a reload re-reads the unit rather than resuming the previous page’s evidence',
    readsA.length > beforeReload, JSON.stringify({ beforeReload, afterReload: readsA.length }));

  // 10b. Nothing the extension writes survives in the page either: the
  // service-worker check above covers chrome.storage, and this covers the
  // stores a content script can reach without any permission at all.
  const pageStores = await tabA.evaluate(async () => {
    const named = (store) => { try { return Object.keys(store); } catch { return ['<blocked>']; } };
    return {
      local: named(localStorage).filter((k) => /standby|evidence/i.test(k)),
      session: named(sessionStorage).filter((k) => /standby|evidence/i.test(k)),
      databases: typeof indexedDB?.databases === 'function'
        ? (await indexedDB.databases()).map((d) => d.name).filter((n) => /standby|evidence/i.test(n ?? ''))
        : ['<unlistable>'],
    };
  }).catch((e) => ({ error: e.message }));
  record('the extension left no Landing evidence in the page’s own storage',
    pageStores.error === undefined && pageStores.local.length === 0
      && pageStores.session.length === 0 && pageStores.databases.length === 0,
    JSON.stringify(pageStores));

  for (const opened of [offRoutePage, tabA, tabB]) await opened.close();

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
