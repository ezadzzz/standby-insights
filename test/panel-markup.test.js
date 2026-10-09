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

test('not-returned days are hatched and available days are open boxes, alike on both surfaces', async () => {
  // An open box is a day a stay can start; a missing day must not look like
  // one, nor like a solid fill the calendar stated.
  for (const [file, prefix] of [
    ['src/panel/panel.css', ''],
    ['src/content/card-annotations.css', '.standby-strip '],
  ]) {
    const css = await read(file);
    const missing = declarationsFor(css, `${prefix}[data-kind="not-returned"]`);
    assert.match(missing, /background:\s*repeating-linear-gradient\(/, `${file}: a missing day is hatched`);
    assert.doesNotMatch(missing, /box-shadow/, `${file}: an outline would read as an open day`);
    assert.match(declarationsFor(css, `${prefix}[data-kind="move-in"]`), /box-shadow:\s*inset 0 0 0 1px/, `${file}: an available day is an open box`);
  }
});
