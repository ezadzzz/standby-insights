# Glossary

The vocabulary this project uses in issues, code, tests, and panel text. Terms
here are the ones that carry a decision — where a casual synonym would blur a
distinction the extension deliberately makes. Use these words rather than
paraphrases, and note gaps instead of coining quietly.

Decisions behind several of these live in [`docs/adr/`](docs/adr/). The approved
requirements are in [`standby-extension-spec.md`](standby-extension-spec.md).

## Identity

**Unit** — one exact rentable home, addressed by its **locator slug** including
any UUID suffix. Never a building and never a floor plan.

**Property** — the building a unit sits in. A property match alone never
identifies a unit.

**Identity check** — comparing the fetched response against what the page
visibly shows. Yields exactly three outcomes, and only the first permits any
unit-specific claim:

- **Confirmed** — slug, unit name, and property name all agree.
- **Ambiguous** — a field needed for the comparison was missing.
- **Mismatch** — a field disagreed.

**Subject** — the unit currently selected, whose evidence the panel is showing.
The word exists to separate it from the peers it is compared against.

## Calendar evidence

**Range** — one returned booking-range segment, with a start date, an optional
end date, and a move-in flag. A **missing range end** is *unspecified*, never
open-ended and never inferred.

**Reservation** — a range whose unbookable reason is `reserved`. No other
unbookable reason is called a reservation. A reservation's end date is shown
**for overlap display only**: it is never a protected, safe-until, or guaranteed
duration.

**Standby-only** — a range whose unbookable reason is
`less_than_minimum_nightly_stay`: too few nights for a standard stay, so only
Standby can book them. Contiguous standby-only ranges read as one **standby-only
gap**, named with its end ("Standby-only through Sep 24") and the reservation that
shortens it ("Standard stays can't fit before the Sep 26 reservation"). This is
what a Standby member scans for, and the extension states it from their side.
It is Landing's published reason, never inferred from neighbouring ranges, and
it says only that a standard stay cannot fit — not that the member cannot be
bumped. The gap exists only while the reservation after it holds.

**Six-week view** — the 42 days from today drawn as a strip on each card and a
weekday grid in the panel, drawn alike on both. Standby-only is green;
reservations and other blocks merge into one dark *Unavailable* fill (the panel
says which in words: day titles and the full range list); standard move-in is a
light fill keyed *Available*; and a day no range covers is an empty outline
keyed to the member as **"No calendar data"** — drawn as missing, never left
looking open. The member's selected check-in is marked; a check
date is not. Statements are made from the reference date forward, and "No
standby-only nights in the next six weeks" requires coverage through the
view's last day; otherwise the view says the returned calendar doesn't cover
it.

**Member-facing words** — the spec's internal terms stay in code and this
glossary; the words a member actually reads are plainer and fixed across
every surface (card key, panel legend, panel grid, all-ranges list, ARIA
labels):

- *Move-in blocked* — Landing's calendar marks the night unavailable for a
  reason other than a reservation or a standby-only gap. Explained once,
  statically, beside the panel legend.
- *No calendar data* (spec: **not returned**) — Landing's calendar says
  nothing about that night; it is not evidence the night is open. Explained
  once, statically, beside the panel legend.
- *Other homes* (spec: **peers**) — the comparison homes, in every surface.
- *Standby-only*, *Reserved*, *Standard move-in* — unchanged from the spec
  terms; already plain enough for a member who never read it.
- *Available*, *Unavailable* — card key only: standard move-in; reserved and
  move-in blocked together.

**Standard move-in** — a range that allows move-in. Its absence is only stated
under coverage (below).

**Coverage** — gapless returned ranges across the interval a statement
describes. Every negative conclusion requires it; a gap withholds the conclusion
rather than weakening it. Missing evidence is never reassuring
([ADR 1](docs/adr/0001-calendar-reference-date-and-negative-conclusions.md)).

**Reference date** — the date facts are stated against. Always present, and
labeled whenever it is not the member's own.

**Selected check-in** — the member's own move-in date, read from the URL with a
rendered control as fallback. **Check date** — the current UTC day, used as the
reference when no selected check-in is readable, and labeled as such. Members
read it as "today"; "check date" stays a code and glossary term.
**Disagreement** — the URL and the page's control name different dates, so no
date is treated as selected.

## Price comparison

**Advertised monthly price** — a home's current all-in monthly figure as
Landing publishes it, discount already applied. It is **not** a quote: it is not
matched to the member's dates and carries no prediction that it will change.

**Eligible** — a positive, finite, USD amount the response itself marks monthly.
The same rule applies to subject and peers alike. A nightly amount is rejected
outright, never converted; no base-rent average is ever substituted.

**Scope** — the comparison's boundary: a parent market slug plus an exact
bedroom count, zero included (a studio is a bedroom count, not a missing one).
An unresolved scope makes the comparison unavailable and is **never** widened to
the display city or guessed.

**Peer** — an eligible home inside the scope that is not the subject. Peers are
deduplicated by slug; fewer than five is *not enough comparable prices*, which
is a distinct outcome from a comparison that could not be completed.

**Complete / incomplete** — whether every reported page was collected and
validated. Incomplete evidence is never shown as a median: a partial market
sample stated as a market figure would be worse than no figure at all.

## Freshness and requests

**Successful-check time** — when evidence was last *successfully* obtained. Unit
evidence and comparison evidence each keep their own; a failed attempt never
advances either.

**Older check** — retained evidence displayed while a new check runs or after
one failed. Always labeled, never silently presented as current.

**Page-instance memory** — evidence lives only in the content script for one
page, in one tab. Nothing is persisted; the extension requests no storage
permission. Reload and teardown end it, and tabs never share it.

**Generation** — the counter that lets a superseded response be discarded. A
**stale generation** is a late reply from a request a newer one has replaced; it
is dropped rather than displayed under the current identity.

**Request bounds** — at most four active requests, four starts per second, and a
20-second timeout, per page instance. Nothing is retried automatically; an
explicit **Refresh** is what starts a new bounded attempt.

## Bump-risk signals

**Bump-risk signals** — the panel section, named by the member on 2026-10-04,
that groups the facts a Standby member weighs when judging how much standard and
Flex demand a home draws: the **Flex price** (the advertised price against the
median of other homes), the **Flex offer** (whether any Flex term advertises a
special offer) and the **minimum stay** (a shorter one lets more standard stays
fit). The name states why the facts are grouped. Each row states a fact and never
its meaning: no direction, verdict, score or ranking. The member draws the
conclusion.

## Terms deliberately not used

**Bump risk** as a claim, score or verdict about a unit or stay,
**protection**, **protected thru**, **safe until**, **guaranteed** — the
extension makes no such claim, and the spec forbids deriving one from this
evidence. The one sanctioned use is the section heading *Bump-risk signals*
above. No Standby stay is ever truly protected: a standby-only gap can open
to standard bookings if the reservation after it changes. Say **standby-only**
instead.

**Special offer** as a unit-level fact — the flag is scoped to one commitment
term on one unit and only says an offer is *advertised*. Whether a stay is
actually discounted depends on the move-in date and is settled only by a quote,
which this extension never requests.
