# `flex_options` and `special_offer` in Landing's public API

Date: 2026-09-11. Method: Landing's own `.well-known/api-catalog` → OpenAPI + tool
catalog, then live read-only public GETs and public MCP tool calls. No credentials
were used and no code was changed.

## The question

1. The authoritative schema of `flex_options` on `GET /api/public/homes/{slug}`.
2. What `special_offer` means *inside* a `flex_options` entry — product/term
   property, or unit property? What makes it true?
3. How that relates to unit-level `has_special_offer`, `special_offer`,
   `blended_offer`, `total_discount_amount`, `total_discount_label`,
   `display_price_without_discount` / `display_price_with_discount`. Which field
   actually says "this unit is discounted right now"?
4. What Landing Flex is as a product.

## Sources, by trust

- `https://www.hellolanding.com/.well-known/api-catalog` — lists
  `.../api/public/openapi.json` (OpenAPI 3.1), `.../api/public/tools.json`,
  `.../api/public` and `.../api/public/tools` (text/markdown references),
  `https://www.hellolanding.com/llms.txt`.
- `https://www.hellolanding.com/api/public/openapi.json` — paths for
  `/api/public/search`, `/api/public/homes/{slug}`,
  `/api/public/homes/{slug}/flex-options`, `/api/public/homes/{slug}/quote`, etc.
  **`components.schemas` contains exactly one schema, `Error`.** No response body
  is typed; the `200` entries carry only a two-or-three-key `example`. There is
  therefore **no machine-readable schema for `flex_options` anywhere in Landing's
  published artifacts.** Everything below the tool-catalog prose is observation.
- `https://www.hellolanding.com/api/public/tools` (markdown tool catalog) — the
  richest owner-written prose about these fields.
- Live responses: 200 homes across 8 markets (`birmingham, austin, denver,
  phoenix, atlanta, dallas, nashville, charlotte`, page 1 × 25 each), plus home,
  flex-options and quote responses for specific slugs, plus public MCP
  `search_apartments_tool` / `get_quote_tool` calls.

---

## What was established

### 1. `flex_options` schema on the public home response

Observed on `GET /api/public/homes/{slug}` and on every `search` result: an array
of objects. Across **398 entries on 200 homes, the key set was identical every
time** — exactly these five keys, no more, no fewer, never null:

| Field | Type | Observed domain (398 entries) | Meaning |
|---|---|---|---|
| `committed_nights` | integer | `180`, `365` only | The commitment tier, in nights. It is the value you pass as `committed_nights` to `get_quote` / `get_apartment` alongside `end_date: "indefinite"`. The tool schema's full enum is `[30, 90, 180, 365]`; only 180 and 365 were ever emitted in this sample. |
| `label` | string | `"6-Month+ Stay"`, `"12-Month+ Stay"` | Display name of the tier. |
| `months` | integer | `6`, `12` | The same tier in months. Perfectly co-varies with `committed_nights` here. |
| `special_offer` | boolean | `true` / `false`, both values seen for **both** tiers | See section 2. |
| `early_termination_fee_type` | string | `"one-month-rent"` (always with 180/6), `"two-months-rent"` (always with 365/12) | Penalty for leaving the Landing network before the commitment ends. Matches Landing's marketing copy for Flex (2 months' rent on the 12-month product). |

Entry-level combinations seen (count of entries): `{180, one-month-rent, false}`
126, `{365, two-months-rent, true}` 117, `{365, two-months-rent, false}` 81,
`{180, one-month-rent, true}` 74.

Per-home tier sets seen: `{180, 365}` 198 homes, `{180}` only 2 homes. Every one
of the 200 sampled homes had `eligible_for_flex: true` and a non-empty
`flex_options`; **no home in the sample had an empty or absent `flex_options`**,
so the empty case is documented only by Landing's prose (below), not observed.

**No price field.** The tool catalog says `flex_options` is "Landing Flex
commitment tiers **with monthly rates**, always included for eligible homes"
(`/api/public/tools`, search_apartments section). That is wrong as shipped: no
sampled entry carried any rate, amount or currency. To price a tier you must call
`get_quote` with `end_date: "indefinite"` + `committed_nights`. Record this as an
owner-doc/wire contradiction, resolved in favour of the wire.

**A different shape exists at `/homes/{slug}/flex-options`.** That endpoint
returns `{home_slug, eligible_for_flex, minimum_nightly_stay, available_tiers:[
{committed_nights, label, months} ]}` — the tiers there carry **neither**
`special_offer` **nor** `early_termination_fee_type`. Two gates are documented for
it: `eligible_for_flexible_stays` false ⇒ `available_tiers` empty, and a tier is
only offered when its night count ≥ the home's `minimum_nightly_stay`
(`/api/public/tools`, get_flex_options_tool section).

### 2. `special_offer` inside a `flex_options` entry

**It is a property of (this unit × this commitment tier), not of the Flex product
and not of the unit alone.** Established by controlled pairs:

- Same home, same start date, different tier —
  `apartment-in-birmingham-landing-midtown-207-1`, start `2026-09-20`,
  `end_date: "indefinite"` (public MCP `get_quote_tool`), whose `flex_options`
  read `180: false, 365: true`:
  - `committed_nights: 365` → `special_offer: true`, `total_discount: 108`, and a
    charge line `{"type":"discount","label":"Special Offer","metadata":{"rate":0.3}}`
    with sublabel `"Expires on September 20, 2027"`; monthly rent `1564.00`.
  - `committed_nights: 180` → `special_offer: false`, `total_discount: 0`, no
    discount line; monthly rent `1605.00`.
- Reversed polarity on another home —
  `apartment-in-goodyear-az-sunset-view-c-3072`, `flex_options` `180: true,
  365: false`, start `2026-09-20`: the **180** quote carries `special_offer: true`,
  `total_discount: 270`, discount line `"Special Offer"` `rate 0.35`, "Expires on
  March 19, 2027".

So the flag tells you: *booking this home on this tier carries a Landing "Special
Offer" discount line*, which is separate from and on top of the tier's own lower
rent. It is not "this term exists", not a product-wide badge, and not the unit's
headline price discount.

**What makes it true is not fully determinable, and the flag is weaker than the
quote.** The same goodyear home, same tier 180 (flag `true`), quoted with start
`2026-10-01` returned `special_offer: false` and `total_discount: 0` — even though
that offer's own expiry was March 2027. So an offer can be flagged on the tier and
still not apply to a given move-in date. The rule that selects applicable start
dates (a booking-window / "book-by" horizon, vacancy state, or something else) is
not stated in any Landing artifact found and was not reverse-engineered here.
**Treat `flex_options[].special_offer` as "an offer exists for this home on this
tier", never as "your stay will be discounted"; only a `get_quote` for concrete
dates settles that.**

### 3. The unit-level discount fields

**`has_special_offer`, `blended_offer` and `total_discount_label` do not exist in
Landing's public API.** Zero occurrences across all 200 sampled public search
homes, the home/quote/flex-options responses, `openapi.json`, `tools.json`,
`tools` markdown, the `/api/public` reference and `llms.txt`. They come from
Landing's *internal* `/api/v1/...` surface that the sibling project read — see
`C:\Users\ezdan\Dev\active\landing_standby\.hermes\research\2026-08-12_austin-real-data-shape.md`
lines 15 and 119 (`has_special_offer` 0/324 there; "field names, confirmed on the
wire" lists `has_special_offer` / `special_offer`). That prior finding is not
contradicted — it simply describes a different API. Do not expect those names on
`/api/public`.

What the public API actually exposes for "discounted right now":

| Field | Where | Behaviour observed |
|---|---|---|
| `display_price_without_discount` / `display_price_with_discount` | search, home, quote | All-in monthly (or nightly) price, before / after discount. Equal on undiscounted homes. |
| `total_discount_amount` | search + home, **present only when a discount applies** | Absent on 180 of 200 sampled homes; present on 20. On `apartment-in-charlotte-nc-bond-on-mint-901`: `4347 → 4208`, `total_discount_amount: 1673` (the whole-stay discount, not the monthly delta of 139). |
| `special_offer` (top level) | **quote responses only** | Boolean for the quoted dates/tier. Not present on search or home responses. |
| `total_discount` (top level) | quote responses only | Money value of the discount for those dates/tier. |
| `deals_only: true` | `search_apartments_tool` argument — "only return homes currently carrying an active special offer (a deal/discount). This is how you find deals" (`/api/public/tools`) | Charlotte: 22 homes vs 200 unfiltered; **all 22 had `total_discount_amount` present and `with < without`**. Phoenix: 0 vs 140. |

**The answer to "which field says this specific unit is discounted right now" is:
`total_discount_amount` being present (equivalently `display_price_with_discount <
display_price_without_discount`) on the search/home response — for the default
dates that response was computed for.** It is date-dependent, not a unit attribute:
`bond-on-mint-901` shows a discount in search, `special_offer: true` +
`total_discount: 795` for a `2026-09-20` check-in, and `special_offer: false` +
`total_discount: 0` for a `2026-10-01` check-in.

**Bug worth knowing: `deals_only` is silently ignored on the REST mirror.**
`GET /api/public/search?market=charlotte&deals_only=true` returned the same
`total_count: 200` as the unfiltered call, while the MCP tool with the same
argument returned 22. `deals_only` is not among the parameters `openapi.json`
declares for `/api/public/search`, and undeclared query parameters appear to be
dropped rather than rejected. Same for `per_page`/`page`: the REST call echoed
`per_page: 25` regardless of the value passed. Any pagination or filtering the
extension needs must be verified against the echoed values, not assumed.

### 4. What Landing Flex is

From Landing's own tool catalog (`https://www.hellolanding.com/api/public/tools`,
"Landing Flex — terminology"): Flex is "Landing's open-ended, no-fixed-move-out-date
stay option — it's how a guest unlocks Landing's lowest rates: commit to a longer
stay (6+ months) instead of a fixed end date and pay less per month, and that
discount follows the guest across 250+ markets even if they change homes", and it
should be described as "commit to a longer stay, pay less per month — not a
separate product, just a lower-rate booking option on the same homes".

For the member: pick a tier (`committed_nights`), book with no move-out date, pay a
lower monthly rate, keep the rate when transferring homes inside Landing's network,
and owe an early-termination fee if you leave the network early — one month's rent
on the 6-month tier, two months' on the 12-month tier
(`early_termination_fee_type`, corroborated by Landing's marketing pages as
summarised in `...\landing_standby\.hermes\research\landing-programs-standby-vs-flex.md`).
A flex stay has no set move-out date, so its one-time move-out cleaning fee is
charged at move-out and amortised into the displayed monthly price
(`flex_move_out_cleaning_fee`, seen at `$295` on both quoted homes).

For a unit: having `flex_options` means the home accepts open-ended bookings at
those tiers — it is an available *booking mode and rate ladder*, nothing more. It
is **not** a statement about the unit's demand, quality, stability, or Standby
status. Flex and Standby are different customer programs; a home carrying
`flex_options` says nothing about its Standby behaviour.

---

## What was NOT establishable

- **No authoritative machine-readable schema exists.** `openapi.json` types only
  `Error`. The five-field shape above is an observation over 398 entries, not a
  contract. Fields may appear or disappear without notice.
- **Why `special_offer` is true for a given (home, tier).** No public artifact
  states the generating rule. The tool catalog only says deals are
  "auto-generated … (vacancy-driven)" for the *unit-level* deal filter.
- **Why a tier flagged `special_offer: true` yields no discount for some start
  dates** (goodyear, 2026-10-01) despite a later expiry date. Not determinable.
- **Whether `flex_options` is ever absent or empty**, and what `committed_nights`
  30 / 90 look like in the wild — never observed in this sample.
- **Whether `special_offer` can differ between the search response and the home
  response for the same unit at the same moment** — they agreed in every pair
  checked, but that is a handful of pairs, not a guarantee.

---

## Implications for this repo

### `src/lib/facts.js`

- The "shape has been sampled once … anything else it may carry is kept" comment
  (lines 7–12) can be upgraded: the shape is now sampled 398 times across 8
  markets and is stable. The defensive `extra` catch-all is still correct, since
  nothing is contractually typed — keep it.
- The scalar-entry branch (lines 14–17) has no observed counterpart: every entry
  was an object. Harmless, but it is speculative, not evidence-backed.
- `specialOffer: null` for "not supplied" is right and should stay. Observed
  entries always supply it, so `null` in practice means "we read something odd".
- **Nothing here needs to change for correctness.** The one substantive gap is
  vocabulary, not parsing — see below.

### `src/panel/render.js`

- `flexFact` (lines 93–113) leads with "Special offer on N of M supplied Flex
  terms". That wording is now backed by evidence as *term-scoped*, which is
  exactly right — the flag genuinely varies per tier on the same unit. Keep the
  per-term framing; do **not** collapse it into a unit-level "this unit has a
  deal" badge, which would be false (many units flag a tier offer while their
  displayed price carries no discount at all).
- The doc-comment claim "It is stated only about terms that actually supplied the
  field" stays accurate.
- Two wording risks worth a small copy change, if the user wants one:
  1. "special offer" on a term reads like a price cut the member will receive.
     Evidence says it is conditional on the move-in date and only materialises in a
     quote. Something like "special offer advertised on this term" is truer, and
     the panel explicitly does not fetch quotes.
  2. The panel has no unit-level discount line at all. If "is this unit discounted
     right now" is ever wanted, the field to read is `total_discount_amount` +
     `display_price_without_discount` / `display_price_with_discount` from the same
     public home response the facts already come from — **not**
     `flex_options[].special_offer`, and **not** `has_special_offer`, which does
     not exist on this API.
- The spec's price-comparison rules (`standby-extension-spec.md`, user stories
  19–24) use `display_price_*` and `is_price_monthly`; both were present on
  200/200 sampled homes, so that design holds. Note that the advertised price is a
  *discounted* price on units carrying an offer, so a median over peers mixes
  discounted and undiscounted advertised prices. That is consistent with "current
  advertised monthly prices" but worth stating in the panel's disclosure if it is
  not already.

### Operational note for the extension

`deals_only`, `per_page` and `page` are accepted-and-ignored by the REST mirror.
The spec's pagination budget (`per_page: 100`, ≤10 requests) will silently degrade
to 25-per-page if issued as plain REST query parameters. Verify the echoed
`per_page` / `total_pages` before trusting coverage — the spec already requires
complete-coverage validation, and this is the concrete failure mode it must catch.
