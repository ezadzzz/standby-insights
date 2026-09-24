# Standby Insights

Personal-use Chrome extension for reservation evidence and advertised-price context while browsing Landing Standby.

Status: the browsing path is complete and verified unpacked. [Issue #3](https://github.com/ezadzzz/standby-insights/issues/3) delivers exact-unit calendar evidence on a Standby detail page, [#4](https://github.com/ezadzzz/standby-insights/issues/4) states it against the selected check-in, [#6](https://github.com/ezadzzz/standby-insights/issues/6) adds minimum-stay and building facts, and [#7](https://github.com/ezadzzz/standby-insights/issues/7) adds the advertised-price comparison. [#5](https://github.com/ezadzzz/standby-insights/issues/5) annotates rendered Standby search cards as the member browses. [#8](https://github.com/ezadzzz/standby-insights/issues/8) packages it for local loading and turns the acceptance pass into a repeatable script; its remaining gaps are listed below.

- [Specification](standby-extension-spec.md)
- [Glossary](CONTEXT.md) — the vocabulary used in issues, code, and panel text
- [Decision records](docs/adr/)
- [Implementation issue](https://github.com/ezadzzz/standby-insights/issues/1)
- [Original design](docs/provenance/2026-09-10-standby-extension-design.md)
- [Provenance record](docs/provenance/README.md)
- [Shared agent instructions](AGENTS.md) — `CLAUDE.md` links to the same file for Claude.

On Windows, clone with symbolic-link support enabled (`git -c core.symlinks=true clone <repository-url>`) and Developer Mode or symlink privileges. `CLAUDE.md` should resolve to `AGENTS.md`.

The extension is scoped to rendered Standby listings, public API enrichment, a user-opened side panel, and page-memory-only evidence. Reservation dates are facts, not guaranteed stay boundaries. Initial delivery is a locally loaded unpacked desktop Chrome extension.

## Running the tests

```
npm test
```

Fixture-level behavioral tests. No browser, no network.

```
npm run verify:panel
```

Runs the panel in Chromium with illustrative evidence and a simulated extension
message boundary; checks responsive layout, missing-data states, local assets,
and keyboard Refresh without contacting Landing. Add `-- --screenshots` to save
review captures under `.impeccable/review/`. The panel uses the approved margin-note
design (issue #24) with system fonts only; it bundles no font or icon assets.

```
npm run verify:browser
```

Loads this extension unpacked into a real Chromium (Playwright) against the live
public Standby detail page and checks what fixtures cannot: that the content
script parses and runs, which endpoints it calls, that the calls carry no
cookies, that no storage permission exists, that the comparison stays inside its
request budget and its fixed tool, that a card's `View evidence` button opens
the side panel from the keyboard and the panel stays disabled off route, that
separate tabs never share evidence, and that the page's own DOM still matches
the selectors the adapter depends on. Needs network access.

**Run this periodically, not only before a merge.** Several checks assert
*Landing's* current behavior rather than this extension's, and a failure there
means the platform changed under a design premise. The clearest example is
*"Landing still honours the requested page size (design premise)"*: the
comparison refuses a page served at an unrequested size instead of sampling part
of a market, so that check failing means comparisons have correctly become
unavailable, not that the code broke
([ADR 2](docs/adr/0002-comparison-pagination-over-the-public-mcp-endpoint.md)).

## Loading the unpacked extension

Everything the extension runs is in this repository; `npm install` is only for
the verification scripts, and nothing is bundled, compiled, or fetched at
runtime. Load the repository root as-is.

1. Visit `chrome://extensions`, enable **Developer mode** (top right).
2. Click **Load unpacked** and select this repository's root folder — the one holding `manifest.json`.
3. Navigate to a Landing Standby search page (`https://www.hellolanding.com/s/{location}/apartments/standby`) or a detail page (`https://www.hellolanding.com/homes/{slug}/standby`). Search cards are annotated as they scroll into view.
4. Click the extension's toolbar icon, or a card's **View evidence** button, to open the side panel. It stays disabled on every other page.
5. Use **Refresh** to force a fresh check; the panel labels retained evidence as an older check while refreshing or after a failed refresh.

### Reloading after a change

Editing a file under `src/` does not reach an already-loaded extension. With
Developer mode on, the extension's card on `chrome://extensions` carries a
circular **↻** reload control at its lower right; click it, then **reload the
Landing tab as well**. A reload of the extension orphans the content scripts
already injected into open tabs — they stop annotating and give no visible
error — so a Landing tab left open across an extension reload will look
silently dead until it is reloaded.

If annotations stop appearing with no console error, check that in the same
order: reload the extension, reload the tab, then confirm on the extension's
**Details** page that **Site access** covers `www.hellolanding.com`. Chrome
also keeps errors from earlier builds on that page; press **Clear all** before
reading anything there as current.

### Verifying a local load

`npm run verify:browser` is the repeatable form of this: it loads this same
folder unpacked into a real Chromium and checks the whole search-to-panel
workflow against the live public site. Run it after loading to confirm the
build is sound; what it covers, and what it cannot, is below.

## Manual browser verification (acceptance criterion, not fixture-testable)

The automated suite (`npm test`) exercises the public-evidence-to-panel-output seam with fixtures; it cannot prove real fetch/CORS/CSP behavior or Chrome's side-panel/messaging plumbing.

**Observed 2026-09-11**, against a live signed-out page at `https://www.hellolanding.com/homes/apartment-in-austin-tx-lantana-hills-2321/standby`, from that page's own script context (the same origin a content script's `fetch` runs in):

- `document.querySelector('h1').textContent` → `"Lantana Hills 2321"`, matching `GET /api/public/homes/{slug}`'s `name` field exactly, confirming the identity check's heading comparison.
- `document.querySelector('a[href^="/properties/"]').textContent` → `"See all units at Lantana Hills"`, **not** the bare property name `"Lantana Hills"`. This was caught here and fixed: `checkIdentity` now checks the property name as a substring of the link text (`src/lib/identity.js`), not equality — the initial equality-based implementation would have wrongly flagged every real unit as a mismatch.
- `fetch('https://www.hellolanding.com/api/public/homes/apartment-in-austin-tx-lantana-hills-2321', { credentials: 'omit', redirect: 'error' })` → `200`, `type: "basic"`, `redirected: false`, valid JSON with a non-empty `availability.ranges` array. No CSP block, no redirect.
- No `<meta http-equiv="Content-Security-Policy">` tag on the page.

**Observed 2026-09-11 via `npm run verify:browser`**, extension loaded unpacked in Chromium against the live detail and search pages (42/42 checks):

- The content script parses and runs. It previously did **not**: `content_scripts` had `"type": "module"`, which is not a supported manifest key, so every static `import` threw `Cannot use import statement outside a module` and the script died before doing anything. Found only by loading it in a browser — the fixture suite cannot see this. `content-script.js` is now a classic one-line dynamic-import loader for `src/content/main.js`.
- Imported extension modules resolve, confirming they must be listed in `web_accessible_resources`.
- `GET /api/public/homes/{slug}` → `200`, 9 calendar ranges, `name: "Lantana Hills 2321"`, with the full slug unchanged and **no cookie header**. No other Landing API is called by the extension; the page's own `/api/v1/*` calls are its own.
- `chrome.storage` is undefined in the service worker — the extension requests no storage permission at all.
- The comparison called only `search_apartments_tool` on `POST /mcp/public`, with `{"market":"austin","min_bedrooms":2,"max_bedrooms":2,"page":1,"per_page":100,"include_hero_images":false}` — scoped, exact-bedroom, no date/price/rating/amenity/Standby filters — and **no cookie header**. It collected Austin two-bedroom in 2 pages, well inside the ten-request budget, with `per_page: 100` honoured. (Landing capped `per_page` at 40 on 2026-09-24; the comparison now asks for 40 with a 25-request budget. See the ADR 2 amendment.) The REST mirror at `/api/public/search` cannot do this: it pins `per_page` to 25 and ignores `page` entirely, which is why the comparison does not use it ([ADR 2](docs/adr/0002-comparison-pagination-over-the-public-mcp-endpoint.md)).
- `GET /api/public/homes/{slug}` also carries the fields the comparison reads for the subject itself: `{"market_slug":"austin","bedrooms":2,"is_price_monthly":true,"currency":"USD","display_price_with_discount":2144,"display_price_label":" per month"}`. Prior research had recorded that shape only for the *search* response, so it is now asserted live on the *detail* response too.
- Live DOM: `h1` → `"Lantana Hills 2321"`, property link → `"See all units at Lantana Hills"`, and `#unit-calendar-unified-start-date` → `"Check inOctober 1"`. Running the real adapter against that page returned `{ status: 'selected', date: '2026-10-01' }`, confirming the URL/control reconciliation against a live page rather than the design record. The picker `td` label is absent while the picker is closed, as expected of a fallback.

On the Standby search route (`/s/austin-tx/apartments/standby`), signed out: 32 cards rendered and **4 units read** — the 4 actually on screen, which is the viewport discipline demonstrated rather than asserted. One annotation per card, inserted after Landing's own anchor, all 32 anchors still linked, each annotation carrying a real `View evidence` button and its reference date named: `"Next reservation Sep 21, 2026 / No standard move-in offered Sep 11, 2026 / No selected check-in was read. Stated against the check date, Sep 11, 2026."`

The card's visible identity differs from the detail page's, which is why it has its own check: a card reads `"Cortland Southpark Terraces4.2Unit 1831|2|1Available…"` while the public response names that unit `"Cortland Southpark Terraces 1831"`. An exact heading comparison, reused from the detail page, would have rejected every real card.

### The side panel, settled

The design's largest open question was whether Chrome carries a member's click
out of the page, through the service worker, and into `chrome.sidePanel.open()`
— `sidePanel` has no automation surface, so it was recorded as unprovable. It
is provable without one: `chrome.runtime.getContexts({ contextTypes:
['SIDE_PANEL'] })` reports the panel document, and an `unhandledrejection`
listener installed in the worker catches a refused `open()`.

**Observed 2026-09-11**, from focusing a card's `View evidence` button and
pressing Enter — keyboard alone, which is both the accessibility requirement
and the harder case for the gesture: zero `SIDE_PANEL` contexts before, one
afterwards (`.../src/panel/panel.html`), and no rejection in the worker. The
gesture does survive the hop, so the design needs no revision here. The panel
reads `enabled: true` on a Standby route and `enabled: false` on
`https://www.hellolanding.com/`, which is the gating in
`src/background/background.js` observed rather than assumed.

Also now covered by the script: `Refresh` is a real `<button>` that Tab reaches
with a visible focus ring, and the panel's announcer is a
`role="status" aria-live="polite"` region — the wording and the moment of the
announcement stay the fixtures' job. Two tabs on the same unit each issue their
own uncredentialed read of it rather than sharing one, a reload makes the unit
be read again rather than resuming the previous page's evidence, and the page's
own `localStorage`, `sessionStorage` and IndexedDB hold nothing from the
extension — the stores a content script can reach with no permission at all.

### Observed in a signed-in desktop Chrome, 2026-09-11

Driven through the Claude in Chrome extension against the user's own
signed-in profile, which the Playwright run cannot reach:

- The Standby search route annotated as the member scrolled: 32 cards rendered, 4 annotated on load and 12 after scrolling, one annotation per card, every one carrying a `View evidence` button, all 32 of Landing's anchors still linked and in their original order.
- `document.activeElement` stayed `BODY` across load, annotation, and scrolling — background observation never moved focus and never opened the panel.
- Full slugs survive the signed-in card list, including UUID-suffixed ones (`apartment-in-austin-tx-promesa-1323-f8b8cfb9-c931-433e-9c23-033cbc5dab35`).
- Annotation text wraps (`overflow-wrap: anywhere`), states its status in words, and its `View evidence` control is a native `<button type="button">` with `tabIndex 0`, outside Landing's anchor.
- The same route annotates in an ordinary hand-opened tab in that profile, confirmed by the user.

### Remaining acceptance gaps

These are not covered by either the fixture suite or `verify:browser`, and are
reported rather than claimed:

- **The toolbar-icon path.** `chrome.action.onClicked` opening the panel (`src/background/background.js`) has no automation surface — Playwright cannot click a toolbar icon — so only the card's `View evidence` path is verified end to end. Both routes end in the same `chrome.sidePanel.open()` call, and the gating around it is checked.
- **Rate-limit behaviour against a real 429.** That offscreen card reads pause, the selected unit still loads, and the on-page `Resume reading listings` control releases the held reads. The controller's response is covered by fixtures; Landing did not return a 429 during any observed run, so the live path is unexercised.
- **The panel's port disconnecting when the side panel is dismissed.** The comparison depends on it — a closed panel must stop collecting comparisons for units merely browsed past. Fixtures cover the controller's response to the signal; nothing here proves Chrome delivers it on dismissal.
- **Service-worker idle/restart.** The worker holds no state the panel depends on, but that has not been demonstrated across an actual eviction.
- **Route and locale coverage.** Every observation above is Austin and Dallas, on `/s/{location}/apartments/standby` and `/homes/{slug}/standby`, in English, signed in as one account. No other market, locale, or account tier has been inspected, and general-home routes are deliberately not annotated.

A note on method, so the same false alarm is not chased twice: driving the
signed-in Chrome through an automation extension, the annotator worked and
then stopped, giving 32 cards and 0 annotations with no console error and no
recovery from reloading the page or the extension. The same build annotated
18/18 cards on three consecutive loads in a clean Chromium profile, kept
annotating with the side panel open, and annotated normally in a tab the user
opened by hand in that same signed-in Chrome. The stoppage is an artifact of
the automated tab — a debugger-attached tab in a managed tab group — not
extension behaviour. Confirm anything surprising in an ordinary tab before
recording it as a defect.

If any of these turn out to differ from the design's assumptions, revise the
design before changing the request location or broadening permissions.
