export class GateTimeoutError extends Error {
  constructor() { super('Request timed out'); this.name = 'GateTimeoutError'; }
}

export class GateCancelledError extends Error {
  constructor() { super('Request cancelled'); this.name = 'GateCancelledError'; }
}

/**
 * Bounds concurrent work for one page instance: at most `maxConcurrent`
 * active tasks, at most `maxStartsPerSecond` new starts in any trailing
 * second, each task aborted after `timeoutMs`. Never retries automatically.
 * ponytail: single page-instance gate, not shared across tabs — a global
 * lock per extension would be the upgrade if multi-tab coordination is ever needed.
 */
export class RequestGate {
  constructor({ maxConcurrent = 4, maxStartsPerSecond = 4, timeoutMs = 20000 } = {}) {
    this.maxConcurrent = maxConcurrent;
    this.maxStartsPerSecond = maxStartsPerSecond;
    this.timeoutMs = timeoutMs;
    this._queue = [];
    this._active = new Set();
    this._startTimes = [];
    this._drainTimer = null;
    this._tornDown = false;
  }

  schedule(task) {
    return new Promise((resolve, reject) => {
      if (this._tornDown) { reject(new GateCancelledError()); return; }
      const entry = { task, resolve, reject, controller: null };
      this._queue.push(entry);
      this._drain();
    });
  }

  teardown() {
    this._tornDown = true;
    if (this._drainTimer) { clearTimeout(this._drainTimer); this._drainTimer = null; }
    for (const entry of this._queue.splice(0)) entry.reject(new GateCancelledError());
    for (const entry of this._active) {
      clearTimeout(entry.timeoutId);
      entry.controller.abort();
      entry.reject(new GateCancelledError());
    }
    this._active.clear();
  }

  _drain() {
    if (this._drainTimer) { clearTimeout(this._drainTimer); this._drainTimer = null; }

    const windowStart = Date.now() - 1000;
    this._startTimes = this._startTimes.filter((t) => t > windowStart);

    while (this._queue.length > 0
      && this._active.size < this.maxConcurrent
      && this._startTimes.length < this.maxStartsPerSecond) {
      const entry = this._queue.shift();
      this._start(entry);
    }

    if (this._queue.length > 0) {
      const delay = this._active.size >= this.maxConcurrent
        ? null // freed by a completion event, not a timer
        : 1000 - (Date.now() - this._startTimes[0]);
      if (delay !== null) {
        this._drainTimer = setTimeout(() => this._drain(), Math.max(delay, 0));
      }
    }
  }

  _start(entry) {
    entry.controller = new AbortController();
    this._active.add(entry);
    this._startTimes.push(Date.now());

    entry.timeoutId = setTimeout(() => {
      entry.controller.abort();
      this._settle(entry, () => entry.reject(new GateTimeoutError()));
    }, this.timeoutMs);

    Promise.resolve()
      .then(() => entry.task(entry.controller.signal))
      .then(
        (value) => { clearTimeout(entry.timeoutId); this._settle(entry, () => entry.resolve(value)); },
        (err) => { clearTimeout(entry.timeoutId); this._settle(entry, () => entry.reject(err)); },
      );
  }

  _settle(entry, apply) {
    if (!this._active.has(entry)) return; // already settled (e.g. teardown or timeout raced completion)
    this._active.delete(entry);
    apply();
    this._drain();
  }
}
