# 1. Reference date and negative calendar conclusions

Date: 2026-09-11
Status: Accepted
Context: [issue #4](https://github.com/ezadzzz/standby-insights/issues/4)

## Context

The panel states facts about a unit's calendar relative to a date. Two decisions
were needed that the spec implies but does not spell out.

## Decision

**Every negative conclusion requires gapless coverage of the interval it
describes.** "No standard move-in offered before that reservation" is shown only
when the returned ranges cover every day from the reference date up to the
reservation with no intersecting move-in-allowed range. Calendar-wide absence
observations require a contiguous returned calendar. A gap, or a reference date
outside the returned calendar, withholds the conclusion rather than weakening it —
missing evidence is never reassuring.

**There is always a reference date, and it is labeled when it is not the
member's.** A usable selected check-in is the reference. Without one — no
readable date, or a URL/control disagreement — the reference is the check date
(the current UTC day), labeled as such in the panel. Disagreement suspends
personalized emphasis but still shows current and upcoming reservation facts;
withholding them would hide dated evidence the member already has.

## Consequences

- Reservation end dates appear for overlap display only. No statement claims a
  protected, safe-until, checkout, or guaranteed duration.
- The check date is the UTC day. A timezone-sensitive reference would need
  verification against Landing first (marked `ponytail:` in
  `src/lib/evidence-controller.js`).
- Vocabulary: *reference date*, *selected check-in*, *check date*, *standard
  move-in*, *coverage*, *disagreement*.
