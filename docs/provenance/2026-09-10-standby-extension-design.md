# Standby browsing extension — design for review

Status: Q1–Q12 agreed; consolidated design awaiting review. No implementation authorized.
This document records extension decisions without changing the existing web app's behavior.

## Intended result

While a member browses Landing's Standby results, compact card annotations show reservation evidence and standard move-in status. Opening an annotation displays a tab-specific Chrome side panel with the full returned calendar, current advertised-price comparison, minimum-stay information, and building facts. Selected check-in dates affect calendar emphasis, never a promised stay duration. The extension remains useful when price comparisons or individual fields cannot be read.

## Sources and scope

- September 4 handoff: `handoff-standby-extension-scope-2026-09-04.md`, supplied by the user from their temporary directory.
- Repository review: baseline `c8eba46` through `6e4633d`, 40 commits and 42 changed files. Focused existing tests: 314 passed across six files. #191 and #192 closed; Queue calendar work #189 remains open.
- Working direction carried forward: personal-use extension in a separate private repo; DOM enumeration and public API enrichment; no extension calls to `/api/v1`, proxy, backend, or persistent Landing-data storage. The existing web app continues independently. Unlisted store distribution at most; publishing and any demo remain separate decisions.
- The public-API boundary is an architecture constraint, not a claim that all contractual exposure has been independently resolved.

## Confirmed decisions — September 10, round 1

Provenance: the user replied “Agreed on all recommendations” to Q1–Q4 in this design session.

1. **Browsing workflow.** Annotate Standby results as the member browses, with fuller evidence on the selected unit's page. Enumerate only units Landing has rendered; do not automatically traverse unseen results.
2. **Comparison scope.** Compare general-inventory prices within the same market and bedroom count, and show sample size. Rating and walk/transit/bike scores are building facts, not relative rankings. Verify public search coverage before promising it.
3. **Calendar claims.** Present reservation facts and standard move-in evidence separately from Standby-only. Initial wording: “Next reservation starts October 12” and “No standard move-in offered before that reservation.” Do not inherit the web app's “Protected thru” conclusion or treat a reservation start as a verified checkout boundary. Q8 refines which reservations the summary highlights; the consolidated contract below limits claims to the returned evidence.
4. **Freshness.** Show when evidence was checked, provide an explicit Refresh action, and recheck when the member reopens a unit. Keep data in memory; no background polling. Q7 defines failed-refresh behavior and Q9 defines reopening.

The shared glossary in `CONTEXT.md` defines Reservation, Reservation start, Standard move-in range, and Standby-only. The app's complete Standby/general comparison is not a prerequisite to import into the extension: the page enumerates units and their public calendars supply enrichment.

## Confirmed decisions — September 10, round 2

Provenance: the user replied “I agree with all recommendations” to Q5–Q7 in this design session.

5. **Presentation.** Compact annotations on rendered cards open a Chrome side panel showing the selected unit's identity, calendar evidence, price comparison, and Refresh control. Use the same panel alongside individual listing pages. Opening fuller evidence is a user action.
6. **Price basis.** Compare advertised monthly prices with the median for the same market and bedroom count. Show sample size and applicable pricing terms. This is price context, not a same-dates quote or a prediction of bump risk. Require at least five comparable prices and a complete search before displaying a comparison.
7. **Missing evidence.** A failed or malformed calendar response shows “Calendar unavailable”; missing data never establishes no reservations or no standard move-in. Do not attach unit-specific claims to an unmatchable card. Show one “Some listings couldn't be read” notice for such cards. A failed refresh clearly marks any retained result as an older check.

## Confirmed decisions — September 10, round 3

Provenance: the user first agreed to Q9 and Q10, then agreed to Q8 after a plain-language example contrasting reservations before and after their planned October 1 move-in. The clarified Q8 below is the accepted version.

8. **Date reference.** Show the full returned calendar while highlighting reservations relevant to the check-in date selected on Landing. Include reservations already underway on that date. If no date is selected or it cannot be read reliably, show upcoming reservations without assuming when the member will move in. This does not establish Standby availability or a checkout boundary. Example: for an October 1 check-in, retain September 20–25 and October 12–20 reservations in the full calendar, but prioritize October 12 in the summary.
9. **Reopening and refresh.** Opening a unit's evidence panel or entering its listing rechecks that unit. Scrolling past it again or switching browser tabs does not. Market comparisons retain their own check time and stay cached until explicit refresh. The Refresh button updates both unit evidence and its comparison.
10. **First delivery.** Start with a locally loaded, unpacked Chrome extension and test it in the member's normal browsing workflow before considering store distribution. This is a delivery decision, not an instruction to install software now.

## Confirmed decisions — September 10, round 4

11. **Card content.** The user agreed to show the relevant reservation summary and standard move-in status directly on each listing, with a “View evidence” action. The full calendar, price comparison, minimum-stay information, rating, and location scores belong in the side panel. Missing evidence uses Q7's unavailable wording.

12. **Comparison loading.** Fetch current price comparisons on the first evidence-panel open for a market/bedroom set, then reuse that in-memory result. Calendar evidence remains usable while the comparison loads. Provenance: after clarifying that this compares current prices rather than multi-day inventory trends, the user replied “ahh i see. yes go with your recommendation then”.

Inventory growth/shrinkage tracking is outside the extension scope. Current-price comparison asks how a unit's advertised monthly price compares with other matching units in one completed search; it requires neither prior-day scans nor persistent storage.

## Verified research — September 10

### Rendered page contract

Live logged-out inspection of [Austin Standby search](https://www.hellolanding.com/s/austin-tx/apartments/standby) found unit cards at `a[data-testid="pdp-home-card-link"]`. Their hrefs carry a full `/homes/{slug}` link, without the `/standby` suffix. Card captions expose property name, unit number, bed/bath figures, and human-readable availability text.

A page-two link exists; it was not traversed. Before sign-in, clicking a card opened a sign-in/account-creation modal. The user subsequently signed in themselves and authorized continued inspection. No credentials were entered by the agent. Do not mistake this limited observation for support across every route or account state.

The slug is an enrichment locator, not a substitute for validating that returned evidence belongs to the visible exact unit. No robust machine-readable bedroom or availability-date attribute was verified in the inspected cards.

#### Signed-in search and detail check

The signed-in search retains `a[data-testid="pdp-home-card-link"]`, full href slugs, title text, and captions containing property plus unit. Full slugs must be preserved: one inspected slug has a UUID suffix and must not be reconstructed from the title or unit number.

The search check-in control is `#header-calendar-start-date`. A temporary September 15 selection first changed the control text; once the search settled, the URL carried `?startDate=2026-09-15`. An intermediate snapshot without the query was a transient state, not evidence that dates live only in the DOM. The open picker exposes the full selected date in a `td` aria-label beginning `Selected as start date.`. Do not interpret a temporarily mismatched URL and control as a settled date.

Opening the observed Lantana Hills 2321 card created a new tab at `/homes/apartment-in-austin-tx-lantana-hills-2321/standby?startDate=2026-09-15&searchedStartDate=2026-09-15&endDate=indefinite&searchedCity=austin-tx`. The original anchor href lacked these additions. The resulting page showed:

- `h1`: property name plus unit number.
- `#unit-calendar-unified-start-date`: the visible check-in date.
- A `/properties/{property-slug}` link with the property name, independently identifying the building.

The `startDate` URL parameter matched the visible September 15 check-in control on the settled detail page. This verifies one actual signed-in navigation and date handoff, not precedence between conflicting parameters, date edits within the detail page, every market, or all browser locales. The temporary detail tab was closed and the original no-date search restored after inspection; no reservation action was taken.

### Public price data

The live [public catalog](https://www.hellolanding.com/api/public/tools) documents bedroom filters, pagination, explicit market/city scope, and paired `display_price_with_discount` / `display_price_label` fields. Two bounded public MCP search requests for Austin two-bedroom homes returned distinct first and second pages. A full market scan was not performed; REST pagination was not retested.

`/api/public/market-info` already provides bedroom-level average rent and home counts, but these are base-rent averages before seasonal/length-of-stay discounts. The inspected public home response supplies an all-in displayed price, excluding taxes, and no corresponding base-rent field. Therefore those averages are not a verified shortcut for relative price comparisons. Round 2 selects advertised monthly prices, a median, a minimum of five comparable prices, and complete search coverage. The consolidated contract below defines the proposed collection and eligibility rules.

### Date-source limitation

The captured public fixture in `src/data/calendar-fixtures.js` distinguishes top-level `available_from` from `availability.earliest_available_date`; they differ by months in the BLOCKED example. The public top-level value coincides with a standard move-in range in that example. Do not import the web app's `available_from` usage as proof of interchangeability between sources. Q8 settles the intended selected-date interpretation; the signed-in check above verifies one concrete way to read that date without substituting public availability.

### Distribution and presentation capabilities

[Chrome distribution documentation](https://developer.chrome.com/docs/webstore/cws-dashboard-distribution) says anyone with an unlisted item's URL can install it; private distribution restricts users. [Account documentation](https://developer.chrome.com/docs/webstore/set-up-account) requires publisher name and verified contact email and describes their display. Third-party mirroring and account-specific disclosures remain unverified; recheck at publication time.

[Chrome side panels](https://developer.chrome.com/docs/extensions/reference/api/sidePanel) can host extension content alongside a site and open following a user gesture. Round 2 selects this presentation for fuller evidence.

## Consolidated contract — proposed implementation defaults for review

These details implement Q1–Q12. They are included in this review rather than presented as individually approved interview answers.

### Page scope and identity

- Activate on the observed Standby search route family `/s/{location}/apartments/standby` and Standby detail route `/homes/{slug}/standby`, on `https://www.hellolanding.com`. Other route families remain unsupported until inspected. A regular `/homes/{slug}` href within a verified Standby result is a locator; it does not make every general listing page a Standby page.
- Observe rendered cards and enrich them as they enter the viewport. Do not paginate, auto-scroll, enumerate hidden application state, intercept private responses, or fetch unseen Standby inventory. Public general-inventory searches for Q12 are a separate comparison source, not an enumeration source for annotations.
- Preserve complete slugs, including suffixes. Confirm the response slug matches the requested locator, and match the returned property/unit identity against the visible card title/caption or detail heading and property link. Do not infer a unit number by splitting the slug. A property-only match or ambiguous identity produces no attached claim.
- Use observed semantic selectors and a small page-specific adapter. Observe DOM replacement and navigation; remove old annotations and discard late responses when the card identity or active detail unit changes. Exactly one annotation per card; preserve Landing's ordering, links, controls, and focus.
- Read a valid ISO `startDate` after navigation settles, checking agreement with the displayed date when present. Do not substitute `searchedStartDate`, a public `available_from`, or a guessed year for an unreadable/conflicting current date. The full selected-date aria-label is a fallback only when the picker is already rendered; the extension must not open controls to extract hidden state. While controls and URL disagree, suspend personalized emphasis and retain explicitly dated facts.

### Calendar interpretation

- Request one public home response for the unit and retain its validated raw ranges, price metadata, building facts, and check time together. Fetch failure and missing/malformed calendar are unavailable, not an empty valid result.
- Before deriving negative claims, require a nonempty array of ranges with valid calendar dates, actual Boolean move-in flags, coherent start/end order, and no unexplained gaps or contradictory overlaps in the interval being described. An empty or partial calendar cannot establish Standby-only or absence of reservations. Missing unrelated building fields do not invalidate valid calendar evidence.
- `unbookable_reason === 'reserved'` identifies a reservation. Other blocked reasons are displayed as such, never relabeled reservations. Display the full returned ranges as a chronological list with start/end dates and move-in status; an omitted end is shown as unspecified, not infinite coverage.
- Treat dated ranges as including their stated end date when deciding whether a reservation intersects the selected check-in date. This is an overlap display rule, not a checkout-time rule. Highlight an intersecting reservation first, then the next reservation starting later; retain all ranges in the full view. Without a usable selected date, show current/upcoming reservation facts referenced to the check date and label that reference.
- “No standard move-in offered before that reservation” requires verified continuous coverage from the displayed reference date up to the reservation, with no move-in-allowed range intersecting that interval. Do not use a move-in opportunity from before the reference date to decide this statement. Without coverage, omit the interval conclusion.
- “No reservation shown in the returned calendar” and “No standard move-in shown on this calendar” are observations of returned data only. Show finite coverage dates where available; never extrapolate an undated tail, the booking-prevention horizon, or a missing range into indefinite availability or closure. Standby-only stays distinct from the selected-date interval statement and from any promise about the member's stay.

### Current-price comparison

- Use the public unit's parent `market_slug` and bedroom count, including zero for studios. Compare the entire parent market, not only the display city, neighborhood, visible Standby cards, or building. If the market cannot be resolved confidently, show comparison unavailable.
- Call public MCP `search_apartments_tool` with that market, equal minimum/maximum bedrooms, pagination, and `include_hero_images: false`. Omit stay dates, commitment selection, price, rating, amenity, and Standby filters. This is the API's current advertised-price snapshot, not a fixed-stay quote.
- Use only positive finite USD amounts where `is_price_monthly === true`, retaining `display_price_label`, pricing notes, and supplied terms. Apply the same eligibility rule to the subject unit and comparison homes. Never turn nightly prices into monthly amounts or compare against base-rent averages. Explicitly label the result as advertised monthly prices; underlying commitment/discount terms may differ and are not a matched booking quote.
- Fetch every reported page successfully; check response scope, bedroom count, stable totals, and unique complete slugs. Repeated pages, inconsistent totals, malformed envelopes, failed pages, or a budget stop make the comparison incomplete. Do not compute a market median from a partial sample.
- Exclude the subject unit, deduplicate comparison homes, require at least five eligible other homes, and show their median and count. Fewer than five shows “Not enough comparable prices”; other unavailable/incomplete cases say the comparison could not be completed. Building ratings and location scores remain independent facts, with zero reviews treated as unrated.
- Initial budget: 100 homes per page, no more than 10 search requests per comparison attempt, sequential pages, no automatic retry. The 1,000-home ceiling is a conservative starting budget, not a measured market limit. A larger result remains unavailable rather than silently truncated. Explicit Refresh starts another bounded attempt. No scheduled or multi-day scans.

### Lifecycle and request handling

- Keep successful evidence and in-flight deduplication in content-script memory owned by the current page. A page reload, tab close, or extension reload ends that cache; SPA navigation may reuse it within the same page instance. Separate tabs have independent evidence and check times. No localStorage, sessionStorage, IndexedDB, CacheStorage, or chrome.storage for Landing data.
- The content script reads the page and owns public requests/cache. A small extension service worker routes user gestures and messages to a tab-specific side panel; it is not the durable cache owner. This avoids relying on service-worker globals surviving Chrome's idle termination. See [Chrome lifecycle documentation](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle).
- Opening evidence for a unit or entering its listing requests fresh unit data, coalescing duplicate events for the same opening. Mere scrolling over an already-read card, tab focus, or closing the panel triggers no refresh. On a new panel selection, show that unit's identity immediately and never leave the previous unit's evidence underneath it.
- First panel open fetches the comparison if its market/bedroom result is not cached. Later matching selections reuse it with a separate check time. Explicit Refresh bypasses both unit and comparison caches. Keep old same-unit results visibly marked as an older check while refreshing and after failure; failed results do not receive a new successful-check timestamp.
- Start with at most four active requests and at most four new requests per second per page instance, prioritizing the selected unit over offscreen work. A request times out after 20 seconds. Stop queued work on page teardown; discard stale selection/refresh generations. No automatic retries or worker keepalive. Rate-limit responses pause background annotation reads and leave explicit recovery available.
- Request only fixed public home endpoints and the read-only public search tool, using validated arguments, encoded slug path segments, omitted credentials, and no persistent browser HTTP cache for evidence fetches. Reject unexpected redirects instead of following them into private paths. Never accept arbitrary destination URLs or arbitrary MCP tool names from page data/messages. Landing's own browser navigation is not an extension API call.

### Presentation and accessibility

- Card order: reservation summary, standard move-in observation, View evidence. Use words for status; a missing or older check must be distinguishable without color. Allow neutral content to wrap without obscuring Landing controls.
- Panel order: exact unit identity and selected-date context; check time/Refresh; relevant calendar summary and full range list; advertised price comparison with its own check time; minimum-stay/Flex eligibility facts; rating with review count; walk/transit/bike scores. Show absence/unavailability per field without blocking unrelated evidence.
- Use native buttons, keyboard-operable interactions, visible focus, meaningful labels, and a polite status announcement for completed refreshes. The side panel opens only from the user's action; scanning never moves focus or opens it.
- Scope is desktop Chrome and local unpacked use. No Queue, inventory trends, safety score, automatic booking, account management, public listing, telemetry, or backend.

## Reuse and delivery

Copy the small pure `reservations()` and `canMoveIn()` derivations and applicable regression cases from the reviewed calendar module into the separate extension repo; run them only on validated data. Reuse the median calculation and straightforward minimum-stay parsing. Do not copy the web app's general-search comparison leg, `endCondition()`/Protected presentation, demand-direction marks, proxy, or persistence layers.

The current working tree contains concurrent uncommitted web-app changes, including a `cachedPrice()` helper. They are not part of the reviewed shipped baseline. Its monthly-price extraction rule is useful, but its retained scalar lacks the labels, terms, identity checks, and check times required here. Recheck the exact source revision when implementing; do not overwrite or bundle unrelated app work.

The existing fetch/cache cannot be copied unchanged: it turns missing ranges into an empty array and serves cached data on reopen, while the extension must distinguish unavailable evidence and perform Q9's fresh read. Adapt this small boundary in the extension, preserving the raw-range derivations. No shared package or monorepo restructure is needed.

Deliver a separate private repo with a minimal Manifest V3 extension, bundled local assets, and local unpacked loading instructions. Keep runtime dependencies minimal; use existing pure code and browser primitives. Selecting a repo name/path and installing the extension are subsequent execution steps, not actions performed by this design session. Store distribution remains deferred and requires a fresh review of visibility and publisher disclosures.

## Acceptance checks for implementation

- Search cards and one signed-in Standby detail page receive evidence for the exact displayed unit; UUID-suffixed slugs, rerendered cards, duplicate observations, and late responses do not misattach it.
- Selected-date tests include no date, a URL/control transition, a reservation ending before check-in, one spanning check-in, one beginning on check-in, and one beginning later. A pre-reference move-in range cannot affect the later interval conclusion.
- Calendar tests distinguish a valid closed calendar, valid open calendar with no reservations, missing/empty/malformed ranges, non-reservation blocked reasons, incomplete interval coverage, and an unspecified tail. None yields a false safe-until claim.
- Price tests cover monthly versus nightly values, mismatched scope/bedrooms, missing terms/labels, nonfinite values, subject exclusion, duplicates/repeated pages, five-versus-four eligible peers, changed totals, and failed/capped pagination.
- Browser checks verify native Landing navigation and ordering, one annotation per card, accessible View evidence, tab-specific panel identity, and usable calendar evidence while comparisons load or fail.
- Request checks verify opening/refetch, scroll/cache reuse, in-flight deduplication, explicit refresh of both sources, old-check labeling on failure, cancellation, queue bounds, and no automatic polling. Network/storage inspection confirms only approved public requests and no persisted Landing data or account credentials.
- Verify the actual fetch/CORS/CSP behavior from an unpacked extension, not only a shell probe. If that requires a different request location or broader permissions, revise this design before introducing it.

## Review boundary

All twelve product decisions are recorded. The implementation defaults above now make the remaining engineering choices explicit for review. They do not establish universal DOM/API stability: only one signed-in market/detail flow and a small public pagination probe were inspected. Broader route/locale coverage is outside the initial supported contract; failure must be visible and conservative.

Next step: confirm this consolidated design matches the intended extension, then prepare the implementation plan for its separate repo. No application code, new repository, installation, publication, or commit is authorized by this document alone.
