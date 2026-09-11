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
    this._backgroundPaused = false;
  }

  get isBackgroundPaused() {
    return this._backgroundPaused;
  }

  /**
   * Holds offscreen card work after a rate limit. Queued background tasks stay
   * queued rather than failing, and nothing resumes on a timer: recovery is
   * always something the member asks for.
   */
  pauseBackground() {
    this._backgroundPaused = true;
  }

  resumeBackground() {
    this._backgroundPaused = false;
    this._drain();
  }

  /**
   * Queues one task. The member's own selected unit is served before offscreen
   * card work, however much of it is already waiting: scrolling must never put
   * the unit they just opened behind a backlog.
   */
  schedule(task, { priority = 'background', key = null } = {}) {
    return new Promise((resolve, reject) => {
      if (this._tornDown) { reject(new GateCancelledError()); return; }
      const entry = { task, resolve, reject, controller: null, priority, key };
      this._queue.push(entry);
      this._drain();
    });
  }

  /**
   * Promotes queued work to the member's own lane. Used when they ask for a
   * unit a background read is already waiting on: the request they are waiting
   * for must not sit behind a rate-limit pause it was queued under.
   */
  escalate(key) {
    let promoted = false;
    for (const entry of this._queue) {
      if (entry.key === key && entry.priority !== 'selected') {
        entry.priority = 'selected';
        promoted = true;
      }
    }
    if (promoted) this._drain();
    return promoted;
  }

  /**
   * The next entry to start: any selected one, else the oldest queued that is
   * currently allowed to run. Returns null when only paused work is waiting.
   */
  _takeNext() {
    let index = this._queue.findIndex((entry) => entry.priority === 'selected');
    if (index === -1) {
      if (this._backgroundPaused) return null;
      index = 0;
    }
    return this._queue.splice(index, 1)[0];
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

    let onlyPausedLeft = false;
    const windowStart = Date.now() - 1000;
    this._startTimes = this._startTimes.filter((t) => t > windowStart);

    while (this._queue.length > 0
      && this._active.size < this.maxConcurrent
      && this._startTimes.length < this.maxStartsPerSecond) {
      const entry = this._takeNext();
      if (entry === null) { onlyPausedLeft = true; break; }
      this._start(entry);
    }

    // Paused work is not waiting on a slot or the rate window, so no timer can
    // release it — resumeBackground() is the only thing that does.
    if (this._queue.length > 0 && !onlyPausedLeft) {
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
