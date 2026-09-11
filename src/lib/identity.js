function normalize(text) {
  return typeof text === 'string' ? text.trim().toLowerCase().replace(/\s+/g, ' ') : null;
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
