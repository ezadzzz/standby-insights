# Standby Insights

Personal-use Chrome extension for reservation evidence and advertised-price context while browsing Landing Standby.

Status: [issue #3](https://github.com/ezadzzz/standby-insights/issues/3) delivers exact-unit calendar evidence on a Standby detail page. Card annotations, date-reference emphasis, price comparison, and building facts are separate issues (#4-#7) and not yet built.

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

The automated suite (`npm test`) exercises the public-evidence-to-panel-output seam with fixtures; it cannot prove real fetch/CORS/CSP behavior or Chrome's side-panel/messaging plumbing. After loading unpacked, confirm in DevTools:

- The `GET https://www.hellolanding.com/api/public/homes/{slug}` request succeeds from the content script's context with no credentials attached and no unexpected redirect.
- The Network tab shows no other Landing origin/API called by the extension.
- Application > Storage shows no extension-written Landing data in localStorage/sessionStorage/IndexedDB/chrome.storage.
- The panel is keyboard-operable (Tab to Refresh, Enter/Space activates it) with a visible focus ring.
- Reloading the tab or closing it clears in-memory evidence — reopening the panel shows a fresh check, not stale data from before the reload.

If any of these differ from the design's assumptions, revise the design before changing the request location or permissions.
