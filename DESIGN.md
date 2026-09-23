---
name: Standby Insights
description: The card, opened up. A dashed, unfilled note under a dark source tab, in monospace, on white.
colors:
  paper: "#ffffff"
  tab: "#22343a"
  tab-on: "#eef3f2"
  on: "#2d3538"
  on-2: "#5d686b"
  outline: "#a7b0b2"
  mark: "#8a9598"
  standby-only: "#1d9e75"
  standby-only-text: "#0f6e52"
  standby-only-numeral: "#04261b"
  hatch-stroke: "#b4bcbe"
  hatch-ground: "#f1f3f3"
  divider-light: "#d3d8d9"
typography:
  headline:
    fontFamily: "ui-monospace, Cascadia Mono, Consolas, monospace"
    fontSize: "19px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  price:
    fontFamily: "ui-monospace, Cascadia Mono, Consolas, monospace"
    fontSize: "26px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  price-narrow:
    fontFamily: "ui-monospace, Cascadia Mono, Consolas, monospace"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.2
  price-unavailable:
    fontFamily: "ui-monospace, Cascadia Mono, Consolas, monospace"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.2
  supporting:
    fontFamily: "system-ui, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
  status:
    fontFamily: "ui-monospace, Cascadia Mono, Consolas, monospace"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.45
  title:
    fontFamily: "ui-monospace, Cascadia Mono, Consolas, monospace"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.35
  body:
    fontFamily: "system-ui, Segoe UI, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "tnum"
  data:
    fontFamily: "ui-monospace, Cascadia Mono, Consolas, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "ui-monospace, Cascadia Mono, Consolas, monospace"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: 1.5
    letterSpacing: "0.12em"
  tab:
    fontFamily: "ui-monospace, Cascadia Mono, Consolas, monospace"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: 1.8
    letterSpacing: "0.1em"
rounded:
  none: "0px"
spacing:
  hair: "2px"
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  source-note:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.on}"
    rounded: "{rounded.none}"
    padding: "22px 16px 16px"
  source-tab:
    backgroundColor: "{colors.tab}"
    textColor: "{colors.tab-on}"
    typography: "{typography.tab}"
    rounded: "{rounded.none}"
    padding: "1px 8px"
  text-action:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.on}"
    typography: "{typography.data}"
    rounded: "{rounded.none}"
    padding: "0 2px"
    height: "44px"
  text-action-disabled:
    textColor: "{colors.on-2}"
  section-label:
    textColor: "{colors.on-2}"
    typography: "{typography.label}"
  grid-day-standby-only:
    backgroundColor: "{colors.standby-only}"
    textColor: "{colors.standby-only-numeral}"
    typography: "{typography.data}"
    height: "32px"
  price-figure:
    textColor: "{colors.on}"
    typography: "{typography.price}"
---

# Design System: Standby Insights

## Overview

**Creative North Star: "The Card, Opened Up"**

Standby Insights lives on someone else's page. On Landing's listing cards it appears as a small dashed note under a dark tab that names the source; in the side panel it is that same note, opened up to hold the full answer. The two surfaces are one system: white ground, a 1px dashed outline that is never filled, a dark square tab reading "Standby Insights", and monospace for everything that is data. Nothing Landing draws looks like this, so nothing here reads as theirs, and nothing here outweighs the listing itself.

Density is quiet and tabular. The note holds what a member screened for (unit, check time, the standby-only headline, a six-week grid). Everything after it (prices, facts, location) sits outside the note in sections separated by dashed rules, one step quieter. Status always lives in words; color, hatch, outline and dots repeat those words as a picture and never replace them.

This system replaces the Scout / Picture Desk panel (petrol ink, Archivo display face, outline icons) shaped on 2026-09-12. That direction is superseded history only; its capture is `.impeccable/mocks/panel-scout-icons.png`.

**Key Characteristics:**
- Dashed, unfilled note under a dark square source tab, on both card and panel.
- Monospace for tabs, labels, headings, dates, prices and grid numerals; system sans only for caveat prose.
- One accent (standby-only green); every other state is a texture: hatch, outline, dots.
- Square corners everywhere. No elevation, no icons, no web fonts.
- Hierarchy by dashed rules and gray steps, not by boxes or fills.

## Colors

A cool-gray ink system on pure white, with one green that means exactly one thing.

### Primary
- **Standby Green** (standby-only): the fill for standby-only days in the grid and card strip, the small square before a standby-only headline, and the legend key. Numerals on it are Standby Numeral green (standby-only-numeral), near-black, at weight 700.
- **Deep Standby Green** (standby-only-text): the headline text color when the answer is standby-only, so the green word stays legible at text sizes.

### Neutral
- **Paper** (paper): the ground of the panel and the halo behind grid numerals.
- **Slate Tab** (tab): the source tab background and the text-selection background.
- **Tab Mist** (tab-on): text on the tab and on selection.
- **Graphite** (on): primary text, Refresh, focus outlines, today outline, check-in corner mark, and the not-returned numerals.
- **Weathered Gray** (on-2): secondary text: check time, section labels, weekdays, legend, supporting copy, fact labels, disabled Refresh.
- **Dash Gray** (outline): every dashed rule and the note outline; also the scrollbar thumb.
- **Mark Gray** (mark): the inset outline of standard move-in days and the dots of not-returned days.
- **Hatch pair** (hatch-stroke over hatch-ground): the panel grid's 135-degree stripes (1.5px stroke, 4px repeat) for reserved days, and the same pair drawn as horizontal rules for move-in-blocked days. The card strip and its key draw both darker, Mark Gray over Hatch Ground — the tinted ground, not Paper, is what keeps reserved and move-in-blocked reading as filled marks at 10px, where the stroke pitch alone would collapse to hairlines indistinguishable from standard move-in's bare outline. Mark Gray still holds 3:1 against white.
- **Light Divider** (divider-light): the dashed divider between fact rows and between rows of All returned ranges, one step lighter than section rules.

### Named Rules
**The One Green Rule.** Green appears only where a day or answer is standby-only. It is never a brand color, a link color, a button fill or a success state.

**The Texture Not Hue Rule.** Every non-standby-only state is drawn as a texture in grays: hatch for reserved, horizontal rules for move-in blocked, a 1px inset outline for standard move-in, dots for not returned. Missing data is dotted, never blank and never outlined like move-in. Hatch means a reservation and nothing else, so a blocked day is never hatched.

**The Words First Rule.** A state is always named in text; the grid, strip and legend repeat it. The calendar grid is `role="img"` with a text alternative, and the legend is decorative.

## Typography

**Display Font:** none. There is no display face.
**Body Font:** system-ui (with Segoe UI, sans-serif)
**Label/Mono Font:** ui-monospace (with Cascadia Mono, Consolas, monospace)

**Character:** A ledger voice. Monospace carries every fact a member compares; the system sans only appears for the sentences that qualify those facts. Both are system faces, because the extension makes no third-origin fetches. Body numerals are tabular.

### Hierarchy
- **Headline** (600, 19px, 1.3, -0.01em, mono): the unit name heading the note.
- **Price** (600, 26px, 1.2, -0.02em, mono): advertised price figures; 22px at 380px and below; "Unavailable" drops to 16px (the Title step) with normal tracking. 22px is the one step that exists only as a narrow-width price size.
- **Title** (600, 16px, 1.35, mono, balanced wrap): the standby-only headline, the visual lead of the calendar.
- **Status** (600, 13px, 1.45, mono): the one status sentence a loading or failure state gets (calendar status, identity note, or refresh line; never more than one at a time). The check-time line stays Data and only names a time.
- **Body** (400, 14px, 1.5, sans, tabular numerals): base text. Supporting prose and the calendar summary under the grid step down to 13px, so nothing below the headline outweighs it.
- **Data** (400, 12px, 1.45 to 1.5, mono): check time, the check-in reference note, detail lines, fact labels, price labels, legend, grid numerals.
- **Label** (700, 11px, 0.12em, uppercase, mono, on-2): section headings (h2) for prices, facts and location.
- **Tab** (700, 11px, 1.8, 0.1em, uppercase, mono): the "Standby Insights" source tab only. The card tab uses the same 11px.

Both surfaces share one size ramp: 11 · 12 · 13 · 14 · 16 · 19 · 26px, plus 22px for narrow prices. Fact values sit at 13px mono, one step above their 12px labels. Card annotations use the lower steps: 12px mono body, 13px headline and page notice, 12px action, 11px strip scale, key and tab. Nothing on a card goes above 13px, so the note never outweighs the listing.

### Named Rules
**The Mono For Data Rule.** If a member might compare it across units (a date, a price, a count, a label, a numeral), it is monospace. Sans is reserved for caveat sentences such as fact notes and disclosures.

**The System Faces Rule.** No web fonts, no bundled font files. The stacks above are the whole type inventory.

## Layout

A single column, max 720px, centered, padded 24px vertical and 16px horizontal. The note sits first with 22px top padding (room under the tab) and 16px sides and bottom. Inside the note, the unit header is a two-column grid (name, then Refresh pinned right at auto width) with check time and identity note spanning both columns.

Sections outside the note are separated by a 1px dashed top rule with 20px above content and 22px below; the first section after the note sits 12px down with no rule, since the note's own outline already separates it. Inside the note the calendar section takes a dashed rule with 16px margin and padding. The calendar heading is visually hidden (it remains the section's accessible name); the standby-only headline leads. When the calendar section has nothing to show (before any check, or when identity is unconfirmed), the section is hidden outright so neither an empty ruled band nor an empty "Calendar" landmark appears.

The six-week grid is 7 equal columns with 2px gaps, 32px minimum cell height, weekday initials 14px above it. Prices sit in two equal columns with 16px gap and a dashed vertical rule between them. Facts are label/value rows at a 1 : 1.6 ratio with 7px vertical padding and a light dashed divider.

Spacing steps are 2, 4, 8, 12, 16 and 24px, with a few optical offsets (10, 14, 20, 22px) around headings and rules.

Responsive behavior:
- **380px and below:** body and note side padding tighten to 12px; fact rows stack label over value; price figures drop to 22px.
- **260px and below:** the two price columns stack, and the vertical dashed rule becomes a horizontal one with 12px above.

## Elevation & Depth

Flat. There is no elevation and no drop shadow anywhere; depth is conveyed only by the note's dashed outline, the tab overlapping that outline by half its height, and gray-step text. Two shadow properties exist as drawing tools, not depth: a 1px inset box-shadow draws the move-in outline, and a white text-shadow halo keeps numerals legible over hatch and dots.

### Shadow Vocabulary
- **Move-in outline** (`box-shadow: inset 0 0 0 1px #8a9598`): standard move-in days in the grid, strip and legend.
- **Numeral halo** (`text-shadow: 0 0 2px #fff, 0 0 2px #fff, 0 0 3px #fff`): grid numerals on reserved, move-in-blocked and not-returned days. Not-returned numerals also stay in graphite.

### Named Rules
**The Flat Paper Rule.** Nothing lifts off the page. A box-shadow or text-shadow is allowed only when it draws a mark or protects legibility, never when it suggests elevation.

## Shapes

Square. Every corner is 0 radius, including buttons (radius explicitly reset to 0). The recurring silhouette is the dashed rectangle with a dark rectangular tab breaking its top edge at the left (12px in, 11px above on the panel; 8px in, 10px above on cards). Rules are always 1px dashed; the only solid lines are focus outlines, the today outline (2px graphite, 1px offset), and the check-in mark, a small graphite corner triangle (4px borders, top right of the day).

## Components

### Buttons
Borderless text actions, like a typed instruction.
- **Shape:** square (0px), no border, transparent background.
- **Refresh (panel):** 12px weight 500 mono in graphite, 2px side padding, 44px minimum target height.
- **Hover / Focus:** underline with 3px offset on hover; focus-visible is a 2px solid graphite outline at 2px offset. While a check runs, Refresh is `aria-disabled="true"` (never `disabled`, so it keeps keyboard focus), ignores presses, keeps its "Refresh" label, and goes to on-2 with a wait cursor and no underline.
- **Card action:** the same treatment at 12px with 3px vertical padding and a "→ " prefix ("View evidence" only; the page notice's Resume has none).

### Cards / Containers
- **Corner Style:** square (0px).
- **Background:** none; the paper shows through. Notes are never filled.
- **Shadow Strategy:** none (see Elevation & Depth).
- **Border:** 1px dashed Dash Gray.
- **Internal Padding:** 22px 16px 16px on the panel (12px sides at 380px); 13px 10px 8px on cards.
- **Card note:** 16px above and 12px below under Landing's card link, never overlaying it. Status line, 13px headline, then on-2 detail lines; a qualifying note line is on-2 italic. A card with no standby-only gap drops to one quiet 12px on-2 line, the reservation fact ("Next reservation Oct 14", "No reservation shown from Oct 1"), over its strip; "returned calendar" is said once, in the panel.
- **Page notice:** the same note placed above Landing's results grid with no outer margin, 13px text with Resume sharing the line when there is room.

### Source Tab (signature)
The attribution in words. A dark slate block reading "Standby Insights", uppercase mono, 700, 0.1em tracking, overlapping the top edge of the note. It is a real element, so assistive technology hears the source, and appears exactly once per note. In forced-colors mode it gains a 1px CanvasText border so it keeps its edge. On cards it takes tighter padding (1px 6px, 1.6 line height).

### Six-Week Grid (signature)
Seven columns of 32px day cells with 12px mono numerals. Standby-only days are green fills with bold near-black numerals; reserved days are hatched; move-in-blocked days carry horizontal rules; standard move-in days carry a 1px inset outline; not-returned days are dotted (4px dot pitch). Today gets a 2px graphite outline; the member's check-in gets a graphite corner triangle. The grid opts out of forced-color adjustment so textures survive. A legend below repeats every mark with a 14 x 10px key and a mono label: "Standby-only", "Reserved", "Move-in blocked", "Standard move-in", "No calendar data" (the member-facing word for a not-returned day). A static supporting line beside the legend explains "Move-in blocked" and "No calendar data" once, so neither term depends on a hover title.

### All Returned Ranges
A native `<details>`, collapsed, closing the calendar section under a dashed rule. The summary reads "All returned ranges (N)" as a borderless mono text action (12px, 500, 44px target, hover underline, 2px focus outline) with no disclosure marker. Open, it lists every returned range chronologically in 12px mono, one per row on a light dashed divider, with full dates and status words. It is the keyboard and screen-reader path to ranges past the six-week grid and to the per-day detail the grid only offers on hover.

### Standby Strip (card)
The grid condensed to a 10px horizontal bar of flex segments using the same state marks (darker hatch and rules, dots at 3px pitch), with 1px white week dividers splitting it into six weeks, a 1.5px graphite today edge at the left extending 3px past the bar, and a downward 4px graphite triangle for check-in. A 11px on-2 date scale sits under it, and a key (10 x 7px swatches, 11px labels) names every drawn mark, but only when the strip draws move-in blocked or no calendar data; the usual marks are explained by the panel legend, and the strip's aria-label speaks every mark regardless.

### Standby-Only Headline
Mono title that turns deep green when the answer is standby-only, preceded by a solid green square (9px panel, 7px card) that ignores forced-color adjustment. A mono detail line in on-2 follows.

### Price Comparison
Two columns of mono label, large mono figure and mono caveat, split by a dashed vertical rule; stacks at 260px. Directly under the columns, when both figures are shown, one 14px semibold mono line in on states their difference as plain arithmetic on the rounded figures ("$256 below the median", "Same as the median"), never a verdict. Under that, in 13px sans on-2: the unit's supplied terms, then one caveat sentence ("Advertised prices, not a quote for your dates."). The full disclosure sits in a collapsed native `<details>` whose "About these prices" summary uses the All returned ranges text-action treatment. The comparison check time closes the section.

### Facts List
Mono label and mono value on a dashed-divided row; any second value line is a 13px sans caveat in on-2. Stacks at 380px.

## Do's and Don'ts

### Do:
- **Do** open every Standby Insights surface with the dashed note and the dark "Standby Insights" tab, so attribution is in words.
- **Do** set dates, prices, labels and grid numerals in the mono stack; use system sans only for caveat sentences.
- **Do** reserve Standby Green for standby-only days and answers, and draw every other state as hatch, rules, inset outline or dots.
- **Do** name each state in text and let the grid, strip and legend repeat it.
- **Do** separate secondary sections with 1px dashed rules in Dash Gray, and drop a rule when its section renders nothing.
- **Do** keep text actions borderless mono with a 44px target, a hover underline and a 2px solid focus outline.
- **Do** keep numerals legible over textures with the white halo, and stack fact rows at 380px and prices at 260px.

### Don't:
- **Don't** fill the note, round a corner, or add an elevation shadow; inset outlines and legibility halos are the only shadows.
- **Don't** use green for brand, links, buttons or success.
- **Don't** load web fonts or bundled font files; the system stacks are the inventory.
- **Don't** add icons or icon glyphs; marks are the textures, squares, outlines and corner triangles already in the grid. One exception, confirmed by the member 2026-09-14: the card's text action keeps its "→ " prefix before "View evidence".
- **Don't** leave a visible empty ruled band where a section has no content.
- **Don't** return to the Scout / Picture Desk petrol, Archivo and outline-icon vocabulary.
