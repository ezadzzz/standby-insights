/**
 * A supplied string, or null when the response carried nothing usable there.
 * Whitespace is not content: a blank field is absent, never an empty label.
 */
export function text(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}
