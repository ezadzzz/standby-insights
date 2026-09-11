import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RequestGate, GateCancelledError, GateTimeoutError } from '../src/lib/request-gate.js';

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

test('caps active work at maxConcurrent, starting the next task once a slot frees', async (t) => {
  const gate = new RequestGate({ maxConcurrent: 4, maxStartsPerSecond: 100, timeoutMs: 60000 });
  const gates = [deferred(), deferred(), deferred(), deferred(), deferred()];
  let startedCount = 0;

  const results = gates.map((d, i) => gate.schedule(async () => {
    startedCount += 1;
    await d.promise;
    return i;
  }));

  await new Promise((r) => setImmediate(r));
  assert.equal(startedCount, 4, 'only 4 tasks should have started');

  gates[0].resolve();
  await results[0];
  await new Promise((r) => setImmediate(r));
  assert.equal(startedCount, 5, 'the 5th task starts once a slot frees');

  gates.slice(1).forEach((d) => d.resolve());
  await Promise.all(results);
});

test('caps starts per second, releasing the queue once the window rolls over', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const gate = new RequestGate({ maxConcurrent: 100, maxStartsPerSecond: 4, timeoutMs: 60000 });
  let startedCount = 0;

  const results = Array.from({ length: 5 }, () => gate.schedule(async () => {
    startedCount += 1;
    return startedCount;
  }));

  await new Promise((r) => setImmediate(r));
  assert.equal(startedCount, 4, 'only 4 starts allowed in the first window');

  t.mock.timers.tick(1000);
  await new Promise((r) => setImmediate(r));
  assert.equal(startedCount, 5, 'the 5th start is released after the window rolls over');

  await Promise.all(results);
});

test('a task exceeding the timeout is rejected and its signal is aborted, with no retry', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const gate = new RequestGate({ maxConcurrent: 4, maxStartsPerSecond: 4, timeoutMs: 20000 });
  let sawAbort = false;
  let callCount = 0;

  const result = gate.schedule(async (signal) => {
    callCount += 1;
    return new Promise((_, reject) => {
      signal.addEventListener('abort', () => { sawAbort = true; reject(new Error('aborted')); });
    });
  });

  await new Promise((r) => setImmediate(r));
  t.mock.timers.tick(20000);
  await assert.rejects(result, GateTimeoutError);
  assert.equal(sawAbort, true);
  assert.equal(callCount, 1, 'the gate never automatically retries');
});

test('teardown cancels queued work and aborts in-flight work', async () => {
  const gate = new RequestGate({ maxConcurrent: 1, maxStartsPerSecond: 100, timeoutMs: 60000 });
  const inFlight = deferred();
  let queuedTaskCalled = false;
  let sawAbort = false;

  const first = gate.schedule((signal) => {
    signal.addEventListener('abort', () => { sawAbort = true; });
    return inFlight.promise;
  });
  const queued = gate.schedule(async () => { queuedTaskCalled = true; });

  await new Promise((r) => setImmediate(r));
  gate.teardown();

  await assert.rejects(queued, GateCancelledError);
  await assert.rejects(first, GateCancelledError);
  assert.equal(queuedTaskCalled, false);
  assert.equal(sawAbort, true);
});

test('the selected unit starts before background card work already queued ahead of it', async () => {
  const gate = new RequestGate({ maxConcurrent: 1, maxStartsPerSecond: 100, timeoutMs: 60000 });
  const blocker = deferred();
  const started = [];

  const first = gate.schedule(async () => { started.push('first'); await blocker.promise; }, { priority: 'selected' });
  gate.schedule(async () => { started.push('background-a'); }, { priority: 'background' });
  gate.schedule(async () => { started.push('background-b'); }, { priority: 'background' });
  gate.schedule(async () => { started.push('selected'); }, { priority: 'selected' });

  await new Promise((r) => setImmediate(r));
  assert.deepEqual(started, ['first'], 'only the one active slot is in use');

  blocker.resolve();
  await first;
  await new Promise((r) => setImmediate(r));

  assert.equal(started[1], 'selected', 'the member’s own unit goes next, ahead of offscreen cards');
});

test('background work defaults to background priority, and selected still overtakes it', async () => {
  const gate = new RequestGate({ maxConcurrent: 1, maxStartsPerSecond: 100, timeoutMs: 60000 });
  const blocker = deferred();
  const started = [];

  const first = gate.schedule(async () => { started.push('first'); await blocker.promise; });
  gate.schedule(async () => { started.push('unmarked'); });
  gate.schedule(async () => { started.push('selected'); }, { priority: 'selected' });

  await new Promise((r) => setImmediate(r));
  blocker.resolve();
  await first;
  await new Promise((r) => setImmediate(r));

  assert.equal(started[1], 'selected');
});

test('a rate limit pauses background card reads while the selected unit still runs', async () => {
  const gate = new RequestGate({ maxConcurrent: 4, maxStartsPerSecond: 100, timeoutMs: 60000 });
  const started = [];

  gate.pauseBackground();
  gate.schedule(async () => { started.push('background'); });
  gate.schedule(async () => { started.push('selected'); }, { priority: 'selected' });

  await new Promise((r) => setImmediate(r));
  assert.deepEqual(started, ['selected'], 'offscreen work waits; the member’s unit does not');
  assert.equal(gate.isBackgroundPaused, true);
});

test('explicit recovery releases the paused background work, with no automatic retry', async () => {
  const gate = new RequestGate({ maxConcurrent: 4, maxStartsPerSecond: 100, timeoutMs: 60000 });
  const started = [];

  gate.pauseBackground();
  const queued = gate.schedule(async () => { started.push('background'); });
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(started, []);

  gate.resumeBackground();
  await queued;
  assert.deepEqual(started, ['background'], 'it runs only once recovery is asked for');
  assert.equal(gate.isBackgroundPaused, false);
});
