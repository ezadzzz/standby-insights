# Standby browsing evidence extension

Status: approved by the user on September 10, 2026, including the proposed testing boundaries. Implementation has not started.

## Problem Statement

Members browsing Landing Standby need to understand an exact unit's reservation calendar, standard move-in opportunities, and advertised-price context without leaving their browsing workflow. Missing or stale information can be mistaken for an empty calendar, and reservation dates can be mistaken for guaranteed stay boundaries. Building facts and price comparisons should remain distinguishable from calendar evidence.

## Solution

A personal-use desktop Chrome extension annotates rendered Standby cards with reservation evidence, a standard move-in observation, and a View evidence button. A tab-specific side panel shows the full calendar, selected-check-in context, current advertised-price comparison, minimum-stay/Flex facts, and building facts. Evidence includes check times and explicit refresh. All Landing data remains in page-instance memory.

The supplied design records agreement on twelve product decisions. Its consolidated engineering defaults remain proposals for review; this synthesis does not promote them to previously approved decisions.

## User Stories

1. As a Standby member, I want evidence on cards I encounter, so that I can evaluate units while browsing normally.
1a. As a Standby member, I want each card to lead with any standby-only gap from my date and a six-week strip of reservations with today and my check-in marked, so that I can scan a results column for units standard members can't book.
1b. As a member, I want the panel to show the same six weeks as a weekday calendar, so that I can see today, my check-in, and the reservations already on the books at a glance.
2. As a member, I want Landing's order, links, and controls preserved, so that the extension does not disrupt my search.
3. As a member, I want each annotation tied to the exact displayed unit, so that another unit's evidence cannot mislead me.
4. As a member, I want one notice when some listings cannot be read, so that missing annotations are understandable.
5. As a member, I want reservation facts and standard move-in observations separated, so that I do not confuse different evidence.
6. As a member, I want a View evidence action, so that I control when fuller information opens.
7. As a member, I want the same evidence alongside a Standby detail page, so that I can inspect a selected unit in context.
8. As a member, I want the full chronological calendar, so that I can inspect every returned range.
9. As a member, I want reservations spanning my selected check-in highlighted, so that an already-started reservation is not overlooked.
10. As a member, I want the next later reservation highlighted, so that I can see upcoming calendar facts relevant to my date.
11. As a member, I want earlier reservations retained in the full calendar, so that summaries do not hide source evidence.
12. As a member without a readable check-in date, I want a labeled check-date reference, so that the extension does not invent my plans.
13. As a member changing dates, I want personalized emphasis suspended during disagreement between page and URL, so that transient state is not presented as settled.
14. As a member, I want blocked reasons distinguished from reservations, so that non-reservation restrictions are not mislabeled.
15. As a member, I want interval conclusions limited to continuously covered dates, so that missing ranges do not imply availability or closure.
16. As a member, I want missing, empty, or malformed calendars marked unavailable, so that missing evidence is not reassuring.
17. As a member, I want unspecified range ends labeled explicitly, so that finite evidence is not extrapolated indefinitely.
18. As a member, I want reservation dates presented without protection or safe-until promises, so that I can interpret their limits correctly.
19. As a member, I want an advertised monthly-price median for the same parent market and bedroom count, so that I have relevant price context.
20. As a studio shopper, I want zero bedrooms treated as a valid category, so that studio comparisons work.
21. As a member, I want the subject excluded and peers deduplicated, so that the comparison represents other homes.
22. As a member, I want at least five eligible peers and complete search coverage, so that a partial sample is not presented as a market median.
23. As a member, I want pricing labels, terms, and sample size shown, so that I understand the comparison is not a matched booking quote.
24. As a member, I want unavailable comparisons explained, so that insufficient peers and failed collection are distinguishable.
25. As a member, I want calendar evidence usable while prices load or fail, so that independent evidence remains useful.
26. As a member, I want minimum-stay/Flex facts, ratings with review counts, and walk/transit/bike scores, so that I can inspect relevant facts without invented rankings.
27. As a member, I want absent facts and zero-review ratings identified, so that unknown information is not treated as favorable.
28. As a member, I want unit evidence rechecked on opening its panel or entering its listing, so that deliberate inspection gets a fresh read.
29. As a member, I want cached comparison evidence to show its own check time, so that separate source freshness is visible.
30. As a member, I want Refresh to update unit evidence and its comparison, so that I can request a new check explicitly.
31. As a member, I want retained evidence marked as an older check during refresh and after failure, so that failure cannot make old evidence appear current.
32. As a member switching units or tabs, I want the panel to show only the selected unit's evidence, so that delayed responses cannot attach incorrectly.
33. As a member, I want scrolling and tab focus to avoid unnecessary refreshes, so that normal browsing does not cause repeated collection.
34. As a keyboard user, I want native controls, visible focus, meaningful labels, and refresh announcements, so that I can operate the extension accessibly.
35. As a member, I want readable status words and wrapping content, so that color and cramped card layouts do not obscure meaning.
36. As a member, I want no persisted Landing data, credentials, telemetry, or background polling, so that the extension stays local and bounded.
37. As a member, I want bounded requests and explicit recovery after rate limits, so that the extension does not repeatedly hammer the service.
38. As the local user, I want an unpacked extension with loading instructions, so that I can evaluate it before deciding on distribution.

## Implementation Decisions

### Product decisions carried forward

- Desktop Chrome, rendered Standby results and Standby details, compact card evidence, and a user-opened side panel are the initial scope.
- Selected check-in changes calendar emphasis; it establishes neither Standby availability nor a checkout boundary. Reservation, Reservation start, and Standard move-in range use the source project's glossary. Standby-only means a returned range whose unbookable reason is `less_than_minimum_nightly_stay` (amended 2026-09-12, see `CONTEXT.md`); it is not a promise about a stay. Do not import the web app's complete-scan classification workflow.
- Comparisons use current advertised monthly prices, the same market and bedrooms, a median, complete coverage, at least five eligible other homes, and disclosed terms/counts.
- Unit evidence refreshes on opening or detail entry. Comparisons load on first panel use for a market/bedroom combination and remain cached until Refresh. Refresh updates both sources. Missing evidence remains explicitly unavailable.
- The first deliverable is a separate minimal Manifest V3 extension with bundled local assets and unpacked loading instructions. The existing web application continues independently.

### Proposed engineering defaults from the source design

- Use a small page adapter, a validated public-evidence boundary with pure derivations, and card/panel presentation. The content script owns requests, successful evidence, and in-flight deduplication; a small service worker routes user gestures and tab-specific panel messages. No shared package or monorepo restructure.
- Support only the observed HTTPS Landing Standby search and detail route families. General-home links inside verified Standby cards are locators, not authorization to annotate general listing pages.
- Observe rendered cards entering the viewport. Do not paginate or auto-scroll Standby results, inspect hidden application state, intercept private responses, or enumerate unseen Standby inventory. Handle DOM replacement and navigation with one annotation per card and stale-response rejection.
- Preserve full slugs, including UUID suffixes. Validate the response slug and visible property/unit identity; never reconstruct unit identity by splitting a slug or accepting property-only matches. Ambiguous cards receive no attached unit claim and contribute to one unreadable-listings notice.
- Read valid ISO startDate after navigation settles and reconcile the visible date when present. An already-rendered selected-date accessibility label may supply a fallback. Do not open controls, substitute searchedStartDate or public availability dates, or guess a year. Date disagreement suspends personalization.
- Fetch one public home response and retain validated raw ranges, price metadata, building facts, and successful-check time together. Missing unrelated fields do not invalidate independent evidence. Failure or invalid calendar data is unavailable, not an empty valid result.
- Before negative calendar conclusions, require nonempty ranges, real calendar dates, Boolean move-in flags, coherent ordering, and no unexplained gaps or contradictory overlaps over the claimed interval. Only the reserved reason identifies a reservation. Display every returned range chronologically with dates and move-in status; an omitted end is unspecified.
- Reservation overlap includes its stated end date for display only. Prioritize an intersecting reservation, then the next later start. Without a usable check-in, reference the check date explicitly. A move-in opportunity before the reference date cannot decide a later interval conclusion.
- The statement 'No standard move-in offered before that reservation' requires continuous coverage from the reference date to the reservation without an intersecting move-in-allowed range. Omit unsupported interval conclusions. Calendar-wide absence statements describe returned evidence only, with finite coverage disclosed where available; no infinite inference from tails or booking-prevention horizons.
- Resolve the subject's parent market_slug and bedroom count, accepting zero bedrooms. Use the public search_apartments_tool with equal minimum/maximum bedrooms, explicit market, pagination, and include_hero_images false. Omit dates, commitment, price, rating, amenity, and Standby filters.
- Subject and peers require positive finite USD advertised amounts with is_price_monthly true. Retain available display labels, pricing notes, and terms; missing metadata must be visible, never invented. Nightly conversion and base-rent averages are excluded. Terms may differ; this is not a same-stay quote.
- Complete every reported page and validate scope, bedroom count, stable totals, envelopes, and unique complete slugs. Deduplicate peers and exclude the selected subject before computing its median and count. Repeated pages, inconsistent totals, malformed data, failed pages, and budget stops make comparison unavailable. Four eligible peers are insufficient; five qualify.
- Cache the complete comparison evidence by market/bedrooms, retaining enough identity and price metadata to exclude whichever subject is selected. Do not reuse a prior subject's already-filtered median for another unit. Unit and comparison evidence keep separate successful-check times.
- Begin with 40 homes per page (Landing's maximum since 2026-09-24; originally 100) and at most 25 sequential search requests per attempt, without automatic retry. The 1,000-home ceiling is a proposed conservative budget, not measured market capacity. A capped search is incomplete. Explicit Refresh starts another bounded attempt.
- Page memory survives SPA navigation only within the current page instance; page reload, tab close, or extension reload clears it. Separate tabs are independent. No Landing data in localStorage, sessionStorage, IndexedDB, CacheStorage, chrome.storage, or persistent HTTP evidence caches.
- Coalesce duplicate opening events. Scroll, focus, and panel closing do not refresh. On a new selection, show its identity immediately without previous-unit evidence. Refresh bypasses both caches; retained same-unit evidence remains labeled as an older check during refresh and after failure. Failures never advance successful-check time.
- Start with at most four active requests and four starts per second per page, a 20-second timeout, selected-unit priority, teardown cancellation, and stale selection/refresh generation rejection. Rate limits pause background annotations and leave explicit recovery. No retries, scheduled polling, or service-worker keepalive.
- Request only fixed public home endpoints and the fixed read-only public search tool. Validate arguments, encode slug segments, omit credentials, and reject unexpected redirects. Page messages cannot choose arbitrary destination URLs or MCP tools. No private API or proxy calls.
- Card order (amended 2026-09-12) is standby-only headline, its detail (the reservation that shortens the gap, or the reservation summary when there is no gap), six-week strip, View evidence. The card carries no reference sentence: the strip's Today edge and the check-in marker name the date. The strip starts today and marks a selected check-in; green is standby-only, hatching is reserved, horizontal rules are move-in blocked (amended 2026-09-21, #39), blank is not returned. The panel calendar section leads with the same headline and a six-week weekday grid; the chronological range list is replaced by each grid day naming its whole returned range on hover. A selected check-in is marked on the grid and also stated in words, as "Your check-in: {date}" and in the grid's accessible label (2026-09-21, #40); the check-date and disagreement notes remain. Panel order is identity/date context; check time/Refresh; calendar summary and ranges; comparison with its own check time; minimum-stay/Flex; rating/review count; location scores. Each missing field has an independent unavailable state; zero reviews means unrated.
- Use native buttons, keyboard interaction, visible focus, meaningful labels, text statuses, wrapping layouts, and polite completion announcements. Background observation never opens the panel or moves focus.
- Reuse the small reservation filter, Boolean move-in derivation, median, and applicable minimum-stay parsing from the source application after validation. Its fetch cache currently collapses missing ranges into an empty array and reuses cached reads, so that boundary must change. Do not copy protection conclusions, general-search comparison logic, demand marks, proxies, persistence, or unrelated working-tree changes.

## Testing Decisions

Testing boundaries accepted with the user's specification approval:

1. **Primary automated seam: public evidence inputs to visible card/panel behavior.** Exercise the real extension flow against representative rendered-page fixtures and controlled public responses, dates, and request completion order. Assert what a member sees and which permitted requests occur, not private helper structure. Cover page adapter, evidence validation/derivation, comparison collection, refresh lifecycle, and presentation together where practical.
2. **Unpacked-browser acceptance boundary.** Verify actual content-script fetch/CORS/CSP behavior, tab-specific panel routing, navigation, keyboard access, network destinations, omitted credentials, and absence of persisted Landing data. Fixtures alone cannot prove browser permission or transport behavior. If this requires a different request location or broader permissions, revise the design before implementation proceeds on that assumption.

Reuse the source application's fixture-based calendar regressions and median/minimum-stay examples as prior art; the empty extension workspace has no existing test harness. Add focused pure checks only where they materially simplify coverage, rather than creating a new seam for every helper.

Required behavioral cases:

- Exact-unit matching with full UUID-suffixed slugs, ambiguous property-only matches, replacement cards, duplicate observation, navigation, late responses, and independent tabs.
- No date, conflicting URL/control transition, reservations ending before, spanning, beginning on, and beginning after check-in; pre-reference move-in ranges cannot change later interval conclusions.
- Valid closed and valid open/no-reservation calendars; missing, empty, malformed, contradictory, and partially covered calendars; non-reservation blocks; unspecified tails. None produces a false safe-until claim.
- Monthly/nightly and currency eligibility, nonfinite and nonpositive values, missing labels/terms, wrong scope/bedrooms, studios, subject exclusion across cached selections, duplicates/repeated pages, five versus four peers, changed totals, failed and capped pagination.
- Reopen/refetch, scroll/cache reuse, first comparison load, duplicate-event coalescing, explicit refresh of both sources, separate timestamps, older-check labels after failure, selection changes, timeout, cancellation, concurrency/rate bounds, and rate-limit recovery without automatic retries.
- One annotation per card; original ordering, links, controls, and focus preserved; accessible panel opening; calendar usable while comparison fails; independent missing-field states; no credentials or persisted Landing data.

## Out of Scope

- Web-app changes; Queue; inventory trends or multi-day scans; complete Standby/general visibility scans; safety scores; Protected thru or guaranteed stay claims (standby-only gaps are stated, never as protection).
- Private API calls, proxies, backend services, accounts, credential/MFA handling, automatic booking, telemetry, persistent Landing-data storage, and scheduled polling.
- Uninspected routes/locales, mobile or other-browser support, public store listing, publisher setup, and installation performed by this spec task.
- Implementation code, dependency installation, repository creation, commits, and deployment during specification synthesis.

## Further Notes

- Source: the user-supplied September 10 Standby browsing extension design. Its recorded research is historical evidence, not fresh verification in this task. It reports one signed-in market/detail flow and a small pagination probe, not universal DOM/API stability or complete market coverage.
- Current inspection confirms the source application has reusable calendar derivations and fixture-based tests. Its current fetch/cache behavior is incompatible with this extension's missing-data and reopen rules. This task did not execute tests or change that application.
- Repository: https://github.com/ezadzzz/standby-insights (private). GitHub Issues is the selected tracker; engineering-skill configuration lives in docs/agents/.
- Intended publication label: ready-for-agent. The user approved this specification after synthesis. The original design is preserved unchanged in the repository's provenance documentation; its earlier review status remains historical context. Implementation has not started.
