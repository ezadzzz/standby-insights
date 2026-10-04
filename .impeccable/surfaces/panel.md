# Panel

Mode: Operate. Scope: `src/panel`. Redesign shaped 2026-09-13 for issue #24; replaces the September 12 Scout / Picture Desk direction.

Design readiness: Ready to Implement (comp approved 2026-09-13)
Consensus provenance: The member confirmed the shaped brief on 2026-09-13 in this task. Comp: `../mocks/panel-note.html` with captures `../mocks/panel-note-*.png`; sidecar `../mocks/panel-note.json` records the approval.
Superseded: Scout / Picture Desk (`../mocks/panel-scout-icons.png`) stays as historical evidence.

## Job

A Standby member screens units on their cards for standby-only nights in their time frame. The panel is the "more details" view they open with View evidence: it confirms the same answer first, then carries prices and facts as secondary material.

## Direction

THESIS: The card, opened up. The panel speaks the card's note language so the two surfaces read as one product.

OWN-WORLD: White ground. A dashed, unfilled note under a dark tab reading "Standby Insights" holds the unit name, check time, standby-only headline and six-week grid. Monospace for tabs, labels, dates, prices and grid numerals; system sans for long caveat sentences. Square, no shadows, no icons. Card color key: green only for standby-only, hatch for reservations and blocked days, outline for standard move-in, dots for not returned.

STORY: Confirm unit and check time, read the standby-only answer and grid, then scan prices, facts and location in quieter dashed-ruled sections. Refresh is a borderless monospace text action with a 44px target.

## Revisions

- 2026-10-04: prices, Flex offer and minimum stay merged into one "Bump-risk signals" section of one-fact rows; reasoning and fine print moved behind info-mark tips; location shown as icon tiles. See DESIGN.md (Bump-Risk Signals, Info Mark and Tip, Place Tiles), which supersedes "no icons" below.

## Boundaries

- Restyle only: `render.js` wording, element order and states are unchanged. The only markup change is a wrapper around the unit header and calendar section. Critique P1s ship as their own issues.
- Card annotations are unchanged.
- Binding: attribution in words, no third-origin fetches (system faces only), no storage, forbidden vocabulary, readable at 320px and narrower; rows stack at 380px, prices at 260px.
- On approval, implementation is separate work and DESIGN.md is rewritten from the built panel.
