import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

// A rule for a kind whose declarations are only `transparent` or a text colour
// would leave missing days looking like ordinary ones.
function declarationsFor(css, selector) {
  return [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^}]*)\}/g)]
    .filter(([, selectors]) => selectors.split(',').some((s) => s.trim() === selector))
    .map(([, , body]) => body)
    .join(';');
}

test('the reference note precedes the six-week headline and grid it qualifies', async () => {
  const html = await read('src/panel/panel.html');
  assert(html.indexOf('id="reference-note"') < html.indexOf('id="six-weeks"'));
});

test('the panel legend keys not-returned days', async () => {
  const html = await read('src/panel/panel.html');
  assert.match(html, /<li><i data-kind="not-returned"><\/i>No calendar data<\/li>/);
});

test('a failed refresh gets its own announced status line, separate from the check-time line', async () => {
  const html = await read('src/panel/panel.html');
  assert.match(html, /<p id="refresh-status" role="status"><\/p>/);
  assert(html.indexOf('id="check-time"') < html.indexOf('id="refresh-status"'));
});

test('not-returned days are drawn, not left blank, on both surfaces', async () => {
  const panel = declarationsFor(await read('src/panel/panel.css'), '#calendar-grid [data-kind="not-returned"]');
  const card = declarationsFor(await read('src/content/card-annotations.css'), '.standby-strip-segment[data-kind="not-returned"]');
  for (const body of [panel, card]) {
    assert.match(body, /background:\s*(?!transparent)\S/, 'a missing day needs its own mark');
    assert.doesNotMatch(body, /box-shadow/, 'an outline would read as standard move-in');
  }
});
