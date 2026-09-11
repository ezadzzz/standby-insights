// ponytail: UTC day for the check-date reference; swap for the page's local
// day if a timezone-sensitive reference is ever verified against Landing. The
// panel and the cards share this one so they can never drift apart and state
// facts against different days on the same screen.
export function checkDate(nowMs = Date.now()) {
  return new Date(nowMs).toISOString().slice(0, 10);
}
