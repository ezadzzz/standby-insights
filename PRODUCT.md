# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary user is one Standby member — currently the project's own author —
browsing Landing's Standby search and detail pages in desktop Chrome while
deciding where to live. They are mid-search, moving across many listings, and
want reservation and price evidence without leaving that flow.

Confirmed 2026-09-11: personal use today, but design must stay legible to
another Standby member who has never read the specification or the glossary.
Labels and states explain themselves; expert shorthand is not assumed. Full
onboarding for unfamiliar members is not yet in scope.

## Product Purpose

An unpacked Manifest V3 Chrome extension that shows exact-unit evidence beside
Landing Standby: the returned booking calendar, the reservation situation
relative to the member's own check-in date, bump-risk signals (the advertised
monthly price against the same market and bedroom count, whether a Flex term
advertises an offer, and the minimum stay), and rating and location facts.

The first thing a card answers, from the Standby member's side: does this unit
have a **standby-only** gap — nights too short for a standard stay because a
reservation follows — from my date, and where do today and my check-in fall
against the reservations already on the books?

Success is a member who can read a unit's calendar and price context correctly
while browsing normally — and who is never misled about what the evidence does
not say. Missing evidence must never read as reassuring, and a reservation's
end date must never read as a protected or guaranteed stay boundary.

## Positioning

Landing publishes this data; nothing here is scraped from private state,
inferred, or predicted. The distinguishing mechanism is epistemic discipline
about public data: every statement is tied to an exact unit whose identity was
checked against what the page visibly shows, is stated against a named
reference date, and is withheld entirely when coverage is incomplete rather
than being softened. A neighboring tool could show the same numbers; it could
not truthfully claim it refuses to state a conclusion the evidence does not
cover.

## Operating Context

- Two surfaces, both alongside Landing's own site: annotations injected into
  rendered Standby search cards (`/s/{location}/apartments/standby`), and a
  tab-specific Chrome side panel (`/homes/{slug}/standby` and the search
  route). The side panel is a narrow, user-resizable column beside a page the
  product does not control.
- Cards are annotated only as they enter the viewport, as the member scrolls.
  The extension never paginates, auto-scrolls, or enumerates unseen inventory.
- The panel is opened by the member — the toolbar icon or a card's
  `View evidence` button. Background observation never opens it or moves focus.
- Landing's own card order, links, controls, and focus order are preserved
  intact. The extension is a guest on that page.
- Evidence lives in page-instance memory for one tab. Reload, tab close, or
  extension reload ends it; tabs never share it.
- Installed unpacked from the repository root via `chrome://extensions`. There
  is no store listing and no publisher setup.

## Capabilities and Constraints

- Shipped and verified: card annotations, the side panel's calendar summary and
  full chronological ranges, selected check-in reconciliation, the
  advertised-price comparison, and unit/building facts.
- Permissions are deliberately minimal: `sidePanel` and `webNavigation` only,
  host access limited to `https://www.hellolanding.com/*`. **No storage
  permission exists and none may be added** — no Landing data in
  `localStorage`, `sessionStorage`, IndexedDB, CacheStorage, or
  `chrome.storage`.
- Requests are confined to two fixed public destinations: `GET
  /api/public/homes/{slug}` and the read-only `search_apartments_tool` on
  `POST /mcp/public`. Credentials omitted, redirects rejected. Page messages
  cannot choose arbitrary URLs or tools. **This boundary is binding regardless
  of any future build tooling** — nothing may be fetched at runtime from a
  third origin, including fonts, icons, or scripts.
- Request bounds per page instance: at most four active requests, four starts
  per second, a 20-second timeout, and no automatic retry. Rate limits pause
  background card reads and require an explicit on-page resume.
- Stack today: plain ES modules, no bundler, no runtime dependencies, nothing
  compiled. Confirmed 2026-09-11 that a build step may be added if future work
  genuinely warrants one; the current absence is a fact, not a prohibition.
  Playwright is a dev-only dependency for `npm run verify:browser`.
- Terminology is governed by [`CONTEXT.md`](CONTEXT.md) and is not optional in
  user-visible text. Requirements are in
  [`standby-extension-spec.md`](standby-extension-spec.md); decisions in
  [`docs/adr/`](docs/adr/).
- Explicitly undecided: distribution beyond personal unpacked loading; support
  for markets, locales, account tiers, browsers, or mobile beyond the observed
  English Austin/Dallas desktop Chrome path.

## Brand Commitments

- Name: **Standby Browsing Insights (personal use)**. No logo, wordmark, or
  palette exists.
- **Annotations must read as clearly foreign to Landing** — visually distinct
  from Landing's own card content, so no statement of this extension's can be
  mistaken for Landing's own. Confirmed 2026-09-11 as a product commitment
  about attribution, not a style preference. It applies to the panel too: the
  panel is this product's surface, not a continuation of Landing's. Cards
  carry it quietly, confirmed 2026-09-12: an unfilled dashed monospace note
  under a dark tab that names the source, so attribution is stated in words
  rather than by a heavy dark block.
- Voice: precise, unhedged about what is known, explicit about what is not.
  Written from the Standby member's perspective. Status is always carried by
  words, never by color or position alone. Color does carry meaning in one
  place, confirmed 2026-09-12: **green marks standby-only nights**, the thing a
  Standby member hunts for, beside words that say so; a dark gray fill
  marks unavailable days (reservations and blocks). The
  forbidden vocabulary in `CONTEXT.md` — *bump risk* as a claim, *protection*,
  *protected thru*, *safe until*, *guaranteed* — is binding in every surface;
  *standby-only* is the term for those gaps. Confirmed 2026-10-04: the panel's
  *Bump-risk signals* heading is the one sanctioned use, naming facts the member
  weighs, never a verdict the extension draws.

## Evidence on Hand

- Live verified behavior in `README.md` and `test/browser/verify-unpacked.mjs`:
  a 42-check unpacked-Chromium run against the live public site, plus
  signed-in desktop Chrome observations dated 2026-09-11.
- 18 fixture test files under `test/`, including captured response fixtures in
  `test/fixtures/`.
- Real example data recorded in `README.md`: unit `Lantana Hills 2321`, Austin
  two-bedroom, `$2,144 per month`, 9 calendar ranges, and a real annotation
  string.
- Named open acceptance gaps are recorded in `README.md` and must not be
  presented as covered: the toolbar-icon path, a real 429, side-panel port
  disconnect on dismissal, service-worker eviction, and route/locale coverage.
- Absent, and never to be invented: users other than the author, testimonials,
  install counts, market coverage claims, pricing or licensing, uptime or
  accuracy claims, and any market or locale not listed above.

## Product Principles

1. **Withhold rather than soften.** A conclusion without gapless coverage is
   not stated at all. Missing evidence is never presented as reassuring.
2. **Every claim is anchored** — to one exact unit whose identity was checked,
   and to a named reference date, labeled whenever it is not the member's own.
3. **Attribution is never ambiguous.** The member always knows this evidence
   comes from the extension, not from Landing.
4. **A guest on the page.** Landing's order, links, controls, and focus survive
   untouched; nothing the extension does steals attention or focus.
5. **Local and bounded.** No persistence, no credentials, no telemetry, no
   polling, no third-origin runtime fetches — by construction, not by policy.

## Accessibility & Inclusion

Native controls, keyboard operability, visible focus rings that are never
removed, meaningful labels, and a `role="status" aria-live="polite"` announcer
for refresh completion. Status must be readable as words, never conveyed by
color alone. Content wraps (`overflow-wrap: anywhere`) rather than clipping or
stretching Landing's card layout. The side panel is a narrow, user-resizable
column and must remain readable at its smallest practical width.
