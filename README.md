# Standby Insights

Personal-use Chrome extension for reservation evidence and advertised-price context while browsing Landing Standby.

Status: [issue #3](https://github.com/ezadzzz/standby-insights/issues/3) delivers exact-unit calendar evidence on a Standby detail page, and [issue #4](https://github.com/ezadzzz/standby-insights/issues/4) adds selected-check-in summaries and standard move-in observations to it. Card annotations, price comparison, and building facts are separate issues (#5-#7) and not yet built.

- [Specification](standby-extension-spec.md)
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
npm run verify:browser
```

Loads this extension unpacked into a real Chromium (Playwright) against the live
public Standby detail page and checks what fixtures cannot: that the content
script parses and runs, which endpoint it calls, that the call carries no
cookies, that no storage permission exists, and that the page's own DOM still
matches the selectors the adapter depends on. Needs network access.

## Loading the unpacked extension

1. Visit `chrome://extensions`, enable Developer mode.
2. Click **Load unpacked** and select this repository's root folder.
3. Navigate to a Landing Standby detail page (`https://www.hellolanding.com/homes/{slug}/standby`).
4. Click the extension's toolbar icon to open the side panel. It stays disabled on every other page.
5. Use **Refresh** to force a fresh check; the panel labels retained evidence as an older check while refreshing or after a failed refresh.

## Manual browser verification (acceptance criterion, not fixture-testable)

The automated suite (`npm test`) exercises the public-evidence-to-panel-output seam with fixtures; it cannot prove real fetch/CORS/CSP behavior or Chrome's side-panel/messaging plumbing.

**Observed 2026-09-11**, against a live signed-out page at `https://www.hellolanding.com/homes/apartment-in-austin-tx-lantana-hills-2321/standby`, from that page's own script context (the same origin a content script's `fetch` runs in):

- `document.querySelector('h1').textContent` → `"Lantana Hills 2321"`, matching `GET /api/public/homes/{slug}`'s `name` field exactly, confirming the identity check's heading comparison.
- `document.querySelector('a[href^="/properties/"]').textContent` → `"See all units at Lantana Hills"`, **not** the bare property name `"Lantana Hills"`. This was caught here and fixed: `checkIdentity` now checks the property name as a substring of the link text (`src/lib/identity.js`), not equality — the initial equality-based implementation would have wrongly flagged every real unit as a mismatch.
- `fetch('https://www.hellolanding.com/api/public/homes/apartment-in-austin-tx-lantana-hills-2321', { credentials: 'omit', redirect: 'error' })` → `200`, `type: "basic"`, `redirected: false`, valid JSON with a non-empty `availability.ranges` array. No CSP block, no redirect.
- No `<meta http-equiv="Content-Security-Policy">` tag on the page.

**Observed 2026-09-11 via `npm run verify:browser`**, extension loaded unpacked in Chromium against the same live page (14/14 checks):

- The content script parses and runs. It previously did **not**: `content_scripts` had `"type": "module"`, which is not a supported manifest key, so every static `import` threw `Cannot use import statement outside a module` and the script died before doing anything. Found only by loading it in a browser — the fixture suite cannot see this. `content-script.js` is now a classic one-line dynamic-import loader for `src/content/main.js`.
- Imported extension modules resolve, confirming they must be listed in `web_accessible_resources`.
- `GET /api/public/homes/{slug}` → `200`, 9 calendar ranges, `name: "Lantana Hills 2321"`, with the full slug unchanged and **no cookie header**. No other Landing API is called by the extension; the page's own `/api/v1/*` calls are its own.
- `chrome.storage` is undefined in the service worker — the extension requests no storage permission at all.
- Live DOM: `h1` → `"Lantana Hills 2321"`, property link → `"See all units at Lantana Hills"`, and `#unit-calendar-unified-start-date` → `"Check inOctober 1"`. Running the real adapter against that page returned `{ status: 'selected', date: '2026-10-01' }`, confirming the URL/control reconciliation against a live page rather than the design record. The picker `td` label is absent while the picker is closed, as expected of a fallback.

Still unverified — these need a human at a real Chrome with a signed-in account, because `chrome.sidePanel` has no automation surface and the search flow needs credentials:

- The side panel actually opens on the toolbar-icon click and stays disabled on non-detail pages (`chrome.sidePanel.setOptions` gating in `src/background/background.js`).
- The panel is keyboard-operable (Tab to Refresh, Enter/Space activates it) with a visible focus ring, and refresh completion is announced.
- Reloading the tab or closing it clears in-memory evidence — reopening the panel shows a fresh check, not stale data from before the reload.
- The signed-in search-to-detail handoff, multiple independent tabs, and service-worker idle/restart behavior.

If any of these differ from the design's assumptions, revise the design before changing the request location or permissions.
