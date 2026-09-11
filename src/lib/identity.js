/**
 * Comparable form of a visible or supplied name, or null when there is nothing
 * to compare. Text that is only whitespace is unreadable rather than empty:
 * treating it as a value would turn a field we failed to read into a
 * disagreement with the response, which is a different and stronger claim.
 */
function normalize(text) {
  if (typeof text !== 'string') return null;
  const collapsed = text.trim().toLowerCase().replace(/\s+/g, ' ');
  return collapsed === '' ? null : collapsed;
}

/** Pulls the identity fields checkIdentity needs out of a raw home response. */
export function responseIdentityFromHome(raw) {
  return { slug: raw?.slug, unitName: raw?.name, propertyName: raw?.property?.name };
}

/**
 * Confirms the fetched public response actually belongs to the exact unit
 * visibly displayed on the detail page. Never infers a unit from a
 * property-only match or a split slug — anything short of a full match on
 * slug, unit name, and property name is ambiguous or a mismatch, and no
 * unit-specific claim may be attached in either case.
 */
export function checkIdentity({
  requestedSlug,
  responseSlug,
  responseUnitName,
  responsePropertyName,
  visibleHeadingText,
  visiblePropertyLinkText,
}) {
  const missing = [responseUnitName, responsePropertyName, visibleHeadingText, visiblePropertyLinkText].some(
    (v) => normalize(v) === null,
  );
  if (missing) return 'ambiguous';

  if (requestedSlug !== responseSlug) return 'mismatch';
  if (normalize(responseUnitName) !== normalize(visibleHeadingText)) return 'mismatch';
  // The property link's accessible text wraps the name (observed: "See all
  // units at {property}"), so a substring check is required, not equality.
  if (!normalize(visiblePropertyLinkText).includes(normalize(responsePropertyName))) return 'mismatch';

  return 'confirmed';
}

/**
 * Confirms a rendered search card against the response its own href asked for.
 *
 * A card does not display what a detail page displays. Observed live, a card
 * reads "{property}{rating}Unit {designator}|{beds}|{baths}Available {date}"
 * with no separators, while the public response names the unit
 * "{property} {designator}" — so the detail page's exact heading comparison
 * cannot be reused here and a different check is needed for the same guarantee.
 *
 * The slug already binds card to response: the request was made with the card's
 * own href and the response slug must match it whole, UUID suffix included.
 * What this adds is that the card visibly shows the unit that came back — its
 * property name, and its unit designator as a whole token, so a neighbouring
 * "Unit 1831" can never satisfy a response about "Unit 183".
 *
 * The designator is taken from the response's own two fields, never from the
 * slug: a name that does not extend its own property name yields no designator
 * to check, which is ambiguous rather than a guess.
 */
export function checkCardIdentity({
  requestedSlug,
  responseSlug,
  responseUnitName,
  responsePropertyName,
  cardText,
}) {
  const unitName = normalize(responseUnitName);
  const propertyName = normalize(responsePropertyName);
  const visible = normalize(cardText);
  if (unitName === null || propertyName === null || visible === null) return 'ambiguous';

  if (requestedSlug !== responseSlug) return 'mismatch';

  if (!unitName.startsWith(`${propertyName} `)) return 'ambiguous';
  const designator = unitName.slice(propertyName.length + 1).trim();
  if (designator === '') return 'ambiguous';

  if (!visible.includes(propertyName)) return 'mismatch';
  // Whole-token match: the character after the designator must not continue it.
  const at = visible.indexOf(`unit ${designator}`);
  if (at === -1) return 'mismatch';
  const next = visible.charAt(at + `unit ${designator}`.length);
  if (next !== '' && /[a-z0-9]/.test(next)) return 'mismatch';

  return 'confirmed';
}
