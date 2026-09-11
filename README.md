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

Not re-verified for the selected-check-in slice: the detail page's `#unit-calendar-unified-start-date` control and the open picker's `td[aria-label^="Selected as start date."]` come from the recorded September 10 design inspection (`docs/provenance/`), not a fresh live read. The URL's `startDate` parameter is the primary source and was confirmed in that record; the two DOM selectors only reconcile it or supply a fallback, so an outdated selector degrades to "no selected check-in date was read" rather than a wrong date. Confirm both selectors when loading unpacked.

Not yet observed — these require the packaged extension loaded unpacked, which this environment can't drive automatically. After loading unpacked, confirm in DevTools:

- The same home-fetch request succeeds from the actual content-script execution context (not just the page's own scripts), with no credentials attached.
- The Network tab shows no other Landing origin/API called by the extension.
- Application > Storage shows no extension-written Landing data in localStorage/sessionStorage/IndexedDB/chrome.storage.
- The panel is keyboard-operable (Tab to Refresh, Enter/Space activates it) with a visible focus ring.
- Reloading the tab or closing it clears in-memory evidence — reopening the panel shows a fresh check, not stale data from before the reload.
- The side panel actually opens on the toolbar-icon click and stays disabled on non-detail pages (`chrome.sidePanel.setOptions` gating in `src/background/background.js`).

If any of these differ from the design's assumptions, revise the design before changing the request location or permissions.
