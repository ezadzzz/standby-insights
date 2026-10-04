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

test('the panel legend is built from the drawn marks, not listed statically', async () => {
  const html = await read('src/panel/panel.html');
  assert.match(html, /<ul id="grid-legend" class="grid-legend" aria-hidden="true"><\/ul>/);
});

test('a failed refresh gets its own announced status line, separate from the check-time line', async () => {
  const html = await read('src/panel/panel.html');
  assert.match(html, /<p id="refresh-status" role="status"><\/p>/);
  assert(html.indexOf('id="check-time"') < html.indexOf('id="refresh-status"'));
});

test('not-returned days are drawn, not left blank, on both surfaces', async () => {
  const panel = declarationsFor(await read('src/panel/panel.css'), '#calendar-grid [data-kind="not-returned"]');
  assert.match(panel, /background:\s*(?!transparent)\S/, 'a missing day needs its own mark');
  assert.doesNotMatch(panel, /box-shadow/, 'an outline would read as standard move-in');
  // The card fills every day the calendar speaks for, so a missing day is the
  // one left as an empty outline.
  const card = declarationsFor(await read('src/content/card-annotations.css'), '.standby-strip [data-kind="not-returned"]');
  assert.match(card, /box-shadow:\s*inset/, 'a missing day needs its own mark');
  assert.doesNotMatch(card, /background/, 'a fill would read as a day the calendar speaks for');
});
