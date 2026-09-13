---
name: Standby Insights Panel
description: Scout / Picture Desk — a ruled evidence sheet with neutral outline icons.
colors:
  ink: "#08171c"
  ink-2: "#0d2029"
  ink-3: "#132c36"
  rule: "#1b3641"
  rule-strong: "#44798a"
  on: "#edf5f4"
  on-2: "#a6c3c8"
  on-3: "#7c9aa2"
  focus: "#a6c3c8"
  standby-only: "#1d9e75"
  standby-only-text: "#5dcaa5"
  standby-only-text-light: "#0f6e52"
  card-tab: "#22343a"
  card-tab-on: "#eef3f2"
  card-on: "#2d3538"
  card-on-2: "#5d686b"
  card-on-3: "#7d878a"
  card-outline: "#a7b0b2"
  card-hatch: "#b4bcbe"
  card-hatch-ground: "#f1f3f3"
  card-move-in: "#8a9598"
typography:
  body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  headline:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "27px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-.022em"
  price:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "32px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-.02em"
  masthead:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 800
    lineHeight: 1.5
    letterSpacing: ".06em"
  label:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1.5
    letterSpacing: ".12em"
  supporting:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  action:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: 1.5
    letterSpacing: ".1em"
rounded:
  square: "0"
spacing:
  space-1: "4px"
  space-2: "8px"
  space-3: "12px"
  space-4: "16px"
  space-5: "20px"
  space-6: "24px"
components:
  refresh:
    backgroundColor: "transparent"
    textColor: "{colors.on}"
    typography: "{typography.action}"
    rounded: "{rounded.square}"
    padding: "8px 12px"
  refresh-hover:
    backgroundColor: "{colors.ink-3}"
  refresh-active:
    backgroundColor: "{colors.ink-2}"
  summary:
    backgroundColor: "{colors.ink-2}"
    textColor: "{colors.on}"
    padding: "{spacing.space-3}"
---

# Design System: Standby Insights Panel

## Overview

**Creative North Star: "Scout / Picture Desk"**

A compact, ruled evidence sheet in petrol ink, with Archivo typography and neutral outline signposts. Flat surfaces and off-white text keep dense evidence readable without assigning a reassuring or alarming color to its meaning.

This captures the approved September 12, 2026 panel implementation. Card annotations share the six-week view's color key (below) but not the petrol ground; see Card annotations under Components. The extension retains a distinct identity beside Landing.

**Key Characteristics:**

- Square controls and thin rules.
- Neutral icons paired with explicit words.
- Full evidence wording in a continuous, wrapping document.

Authority: [panel source](src/panel/panel.css), [surface contract](.impeccable/surfaces/panel.md), and approved [D with outline icons](.impeccable/mocks/panel-scout-icons.png). Independent finish review: ship; no material fixes. Documentation was extracted directly; the design engine was unavailable.

## Colors

A dark petrol family supports pale blue-gray secondary text and off-white primary text. Frontmatter preserves the source CSS token names and exact values.

### Primary

- **Petrol Rule** (`rule-strong`): section boundaries, button outline and scrollbar thumb.

### Neutral

- **Deep Petrol Ink** (`ink`): page canvas.
- **Inset Petrol** (`ink-2`): summary field and pressed Refresh.
- **Raised Petrol Tone** (`ink-3`): Refresh hover, without physical elevation.
- **Quiet Rule** (`rule`): internal row dividers and summary outline.
- **Off-White Ink** (`on`): principal text and brand mark.
- **Pale Blue-Gray** (`on-2`): supporting text, labels and icons.
- **Muted Blue-Gray** (`on-3`): declared disabled-button text treatment.
- **Focus Blue-Gray** (`focus`): keyboard outline; intentionally matches secondary text.

**The Neutral Evidence Rule.** Status is stated in words; icons and color never replace those words or imply a condition rating.

**The Standby-only Exception.** One color carries meaning: standby-only green (`#1d9e75` fill, `#5dcaa5` text) marks nights too short for a standard stay, always beside words that say so. Reservations and blocked days are a quiet hatch (`#2c5260` on `ink-3` in the panel grid), standard move-in is a `rule-strong` outline, and not-returned days are blank.

## Typography

**Display Font:** Archivo, with system-ui and sans-serif fallbacks.
**Body Font:** The same family; no separate mono face.

Archivo is bundled locally at `src/panel/fonts/Archivo.ttf`, declared as a variable face (weight 100–900, stretch 62%–125%) with swap display. No runtime font service is used. Tabular numerals align dates and prices.

### Hierarchy

Frontmatter records desktop values: headline for the unit, price for monetary amounts, masthead for identity, label for section headings, supporting for timestamps and caveats, action for Refresh, and body for evidence. Masthead, section labels and Refresh are uppercase; evidence remains sentence case.

Reservation rows and the first summary line use weight 600. Later summary lines use secondary text. Unavailable price text uses 16px and normal tracking; it retains price weight and line height.

## Layout

The document is centered with a 720px maximum width, 20px side padding and 24px bottom padding. Spacing follows the six-step 4px scale above. There are no independently scrolling content regions.

The masthead has 20px vertical padding. The unit header uses a flexible title column and an auto-width Refresh column, with 8px row and 12px column gaps and 24px vertical padding. Check time and identity text span both columns. Sections use 20px top and 24px bottom padding.

Calendar rows divide dates and status into 1.15:1 columns with a 12px gap. Prices use equal columns; the second has a strong vertical rule, 16px left margin and 20px left padding. Fact rows use 1:1.6 columns and a quiet vertical divider.

At **380px and below**, side padding becomes 16px, the title becomes 24px, the button moves below the title, calendar rows stack with a 4px gap, and facts stack with values indented 26px. Price figures become 27px; the more specific unavailable style stays 16px. At **260px and below**, prices also stack with a 16px gap and a quiet horizontal rule. Text wraps rather than clipping.

## Elevation & Depth

No shadows. The summary's inset tone and thin outline distinguish it from the canvas; rules group the remaining content. Hover changes the button's tone only.

## Shapes

Controls and containers are square. Section and internal dividers are 1px. Outline SVGs use currentColor, no fill, 1.7 stroke width, square line caps and miter joins. Standard icons are 20px, the brand mark 26px, calendar status icons 17px and fact icons 18px. Some symbols contain circles; square form language does not prohibit circular icon geometry.

## Components

### Refresh

The sole panel action: outlined, transparent, square, with a 44px minimum height and the frontmatter padding. Hover and active colors are recorded above. Background transitions use 150ms ease-out; reduced-motion preference removes that transition. Keyboard focus uses a 2px focus outline offset 3px. A disabled style exists (muted text, wait cursor); current rendering does not toggle the button disabled.

### Calendar summary and chronological rows

An information icon introduces the inset summary, with 12px padding and gap, 16px top and 8px bottom margins. Empty summaries are hidden. Rows retain complete dates and status words, with neutral calendar, check or blocked icons and a bottom divider.

### Advertised prices

A semantic description list pairs each amount with its own label and monthly unit. The paired display appears only when comparison prices exist. Unavailable subject prices remain explicitly labeled; terms, comparison scope, source disclosure and older-check text stay visible as supplied.

### Facts

Ruled description lists pair Minimum stay and Flex with their values, followed by Rating and walk, transit and bike scores in a separate section. Additional detail lines use supporting typography; unavailable facts retain their labels.

### Card annotations

Approved 2026-09-12 (mock "Option E, tabbed margin note") to replace the petrol slab, which outweighed Landing's cards. Source: [card-annotations.css](src/content/card-annotations.css).

An unfilled note on Landing's white page: 1px dashed `card-outline` border, square, with system monospace text (`ui-monospace`; nothing fetched). A dark `card-tab` label reading "Standby Insights" sits across the top border, so attribution is carried by words, not by a heavy block. Headline 12px/600 in `card-on`; supporting lines 11.5px in `card-on-2`. A standby-only headline turns `standby-only-text-light` and gains a 7px `standby-only` square beside its words. The strip is 10px tall with a 1.5px Today edge; reservations use a `card-hatch` hatch on `card-hatch-ground`. View evidence is a borderless monospace text action prefixed with an arrow, underlined on hover, with a 2px `card-on` focus outline.

### Accessibility and states

Icons are decorative and hidden from assistive technology. Native Refresh remains keyboard operable. Status regions and a polite refresh-completion announcer accompany visible text. Forced-colors mode sets icon color to CanvasText. Loading, date disagreement, unavailable evidence and stale checks use the existing full wording, with no invented status colors.

## Do's and Don'ts

### Do:

- **Do** preserve full labels, source caveats and unavailable or older-check wording.
- **Do** keep the panel in normal document flow and let narrow layouts stack.
- **Do** retain local fonts, local SVG assets and visible keyboard focus.

### Don't:

- **Don't** use condition colors beyond standby-only green, or icon-only evidence statuses.
- **Don't** add decorative controls, photographs, rounded cards or shadows to this approved panel.
