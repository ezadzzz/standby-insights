# 2. Comparison pagination goes over the public MCP endpoint

Date: 2026-09-11
Status: Accepted
Context: [issue #7](https://github.com/ezadzzz/standby-insights/issues/7)

## Context

The price comparison must collect *every* reported page for a market and bedroom
count, because a partial sample shown as a market median is the failure mode the
spec most wants avoided. The spec calls for `search_apartments_tool` with
`per_page: 100` and a ten-request budget.

Landing exposes that tool two ways: a REST mirror at `GET /api/public/search`,
and the public MCP endpoint at `POST /mcp/public`. The REST mirror is the
obvious choice — a plain GET, no envelope to unwrap.

It is also wrong for this purpose.
[Prior research](../research/2026-09-11-flex-options-and-special-offer.md)
recorded that the REST mirror accepts and silently ignores `per_page` and
`page`. That was re-confirmed live while implementing this slice:
`GET /api/public/search?market=birmingham&bedrooms=1&per_page=100&page=2` echoes
`per_page: 25, page: 1`. `openapi.json` declares only `market`, `check_in`,
`check_out`, `bedrooms` (a *minimum*, with no maximum) and `max_price` for that
path; undeclared parameters are dropped rather than rejected.

Built on the REST mirror, the comparison would have had no way to bound
bedrooms exactly, and would have quietly read the first 25 homes of a market
while believing it had read 100 — then published a median over them.

## Decision

**Comparison pagination goes over `POST https://www.hellolanding.com/mcp/public`,
calling `search_apartments_tool`.** It honours `page`, `per_page`,
`min_bedrooms`/`max_bedrooms`, and `include_hero_images`. A single stateless
POST works: no `initialize` handshake and no session header. It is same-origin
with the content script, so this needs **no manifest change and no additional
host permission**.

The endpoint URL and the tool name are module constants in
`src/content/main.js`. Nothing reaching the content script from the page or from
a runtime message can select a destination or a tool.

**The echoed `page` and `per_page` are validated against the values requested,**
not merely for consistency between pages. A page served at a size other than the
one asked for means the request budget is being spent against a different market
shape than the one planned, so it is rejected. This is the concrete check that
catches the REST degradation above, and it is what makes "complete coverage"
an assertion rather than an assumption.

## Amendment, 2026-09-24

Landing began rejecting `per_page` above 40 ("Invalid arguments: number at
/per_page is greater than: 40"), so every comparison became unavailable, as
designed. `verify:browser`'s design-premise check caught it. The page size is
now 40 and the budget 25 requests, which keeps the 1,000-home ceiling. The
largest scope measured that day was Austin one-bedroom at 323 homes (9 pages).
The references to 100 per page and ten requests below describe the original
decision.

## Consequences

- The comparison depends on Landing continuing to honour `per_page: 100`. If it
  ever caps lower, comparisons become **unavailable** rather than silently
  sampling part of a market. That is the intended direction to fail in.
- `npm run verify:browser` carries a check named *"Landing still honours the
  requested page size (design premise)"*. A failure there is Landing changing,
  not this extension breaking — the code handles it correctly by refusing. Run
  the browser verification periodically, not only before a merge, so the premise
  is observed rather than assumed.
- The ten-request budget is a 1,000-home ceiling. Every market sampled so far
  sits well under it. It is marked `ponytail:` in `src/lib/comparison.js`; raise
  it only against a measured market that legitimately exceeds it, never to
  rescue one that paginated unexpectedly.
- The MCP envelope carries its payload as JSON *text* inside
  `result.content[0].text`. An envelope without one is treated as malformed, not
  as an empty market.
- The subject's own scope and price are read from the home *detail* response,
  whose shape prior research had recorded only for the *search* response. The
  browser verification now asserts those fields live.
- Vocabulary: *scope*, *peer*, *eligible*, *complete* / *incomplete*,
  *advertised monthly price* — see [`CONTEXT.md`](../../CONTEXT.md).
