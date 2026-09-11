/**
 * The supplied Flex eligibility facts, or null when the response carries none.
 * An empty list means the response supplied a Flex field with nothing in it,
 * which is stated as such — never as eligibility.
 */
function flexOptions(raw) {
  if (raw === undefined || raw === null) return null;
  const entries = Array.isArray(raw) ? raw : [raw];
  return entries.map(flexOptionText).filter((text) => text !== null);
}

/** A score Landing publishes on the 0–100 band scale, or null if unusable. */
function score(raw, key) {
  const value = raw?.[`${key}_score`];
  if (!Number.isFinite(value) || value < 0 || value > 100) return null;
  const description = raw?.[`${key}_score_description`];
  return { value, description: typeof description === 'string' && description.trim() !== '' ? description : null };
}

/**
 * Renders one supplied Flex option as text. The response's flex_options shape
 * has never been sampled, so nothing is inferred from it: scalars are shown as
 * given and an object is shown as its own scalar fields, labelled with its own
 * keys. Anything with no readable scalar content is dropped rather than
 * displayed as an empty eligibility claim.
 */
function flexOptionText(entry) {
  if (typeof entry === 'string') return entry.trim() === '' ? null : entry.trim();
  if (typeof entry === 'number' || typeof entry === 'boolean') return String(entry);
  if (entry && typeof entry === 'object') {
    const parts = Object.entries(entry)
      .filter(([, v]) => typeof v === 'string' ? v.trim() !== '' : (typeof v === 'number' || typeof v === 'boolean'))
      .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`);
    return parts.length > 0 ? parts.join(', ') : null;
  }
  return null;
}

/**
 * Reads the unit and building facts the panel states, from the same public
 * home response the calendar came from. Every field is validated on its own:
 * one unreadable fact never withholds another, and an absent field is null
 * rather than a favorable default.
 */
export function deriveFacts(raw) {
  const property = raw?.property;
  const rating = property?.member_rating;
  // The source application carries no minimum-stay parser to reuse: every
  // occurrence of minimum_nightly_stay there is a plain night count, so
  // reading the integer is the whole of the applicable parsing.
  const minimumStay = raw?.minimum_nightly_stay;
  return {
    minimumStay: Number.isInteger(minimumStay) && minimumStay > 0 ? minimumStay : null,
    rating: Number.isFinite(rating?.average) && Number.isInteger(rating?.count) && rating.count >= 0
      ? { average: rating.average, count: rating.count }
      : null,
    flexOptions: flexOptions(raw?.flex_options),
    scores: { walk: score(property, 'walk'), transit: score(property, 'transit'), bike: score(property, 'bike') },
  };
}
