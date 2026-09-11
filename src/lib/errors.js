/**
 * Landing asking us to slow down, as distinct from any other failure. It lives
 * here rather than beside the fetchers because the store reacts to it, and a
 * cross-module match on an error's name string is not a contract.
 */
export class RateLimitedError extends Error {
  constructor() { super('Rate limited'); this.name = 'RateLimitedError'; }
}
