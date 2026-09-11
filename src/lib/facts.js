import { text } from './text.js';

const SAMPLED_FLEX_FIELDS = new Set(['label', 'months', 'committed_nights', 'special_offer', 'early_termination_fee_type']);

/**
 * One supplied Flex term. The shape has been sampled once, so the fields that
 * sample carried are read by name and anything else it may carry is kept
 * rather than dropped. special_offer belongs to the term, not to the unit, and
 * its absence is unknown rather than a supplied false.
 */
function flexOption(entry) {
  if (typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean') {
    const label = text(String(entry));
    return label === null ? null : { label, months: null, committedNights: null, specialOffer: null, earlyTerminationFeeType: null, extra: [] };
  }
  if (!entry || typeof entry !== 'object') return null;

  const option = {
    label: text(entry.label),
    months: Number.isFinite(entry.months) ? entry.months : null,
    committedNights: Number.isFinite(entry.committed_nights) ? entry.committed_nights : null,
    specialOffer: typeof entry.special_offer === 'boolean' ? entry.special_offer : null,
    earlyTerminationFeeType: text(entry.early_termination_fee_type),
    extra: Object.entries(entry)
      .filter(([key, value]) => !SAMPLED_FLEX_FIELDS.has(key)
        && (text(value) !== null || typeof value === 'number' || typeof value === 'boolean'))
      .map(([key, value]) => `${key.replace(/_/g, ' ')}: ${value}`),
  };
  const empty = option.extra.length === 0
    && [option.label, option.months, option.committedNights, option.specialOffer, option.earlyTerminationFeeType].every((v) => v === null);
  return empty ? null : option;
}

/**
 * The supplied Flex terms, or null when the response carries none. An empty
 * list means the response supplied a Flex field with nothing in it, which is
 * stated as such — never as eligibility.
 */
function flexOptions(raw) {
  if (raw === undefined || raw === null) return null;
  const entries = Array.isArray(raw) ? raw : [raw];
  return entries.map(flexOption).filter((option) => option !== null);
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
