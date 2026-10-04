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

test('not-returned days are drawn, not left blank, alike on both surfaces', async () => {
  // Both fill every day the calendar speaks for, so a missing day is the one
  // left as an empty outline.
  for (const [file, selector] of [
    ['src/panel/panel.css', '[data-kind="not-returned"]'],
    ['src/content/card-annotations.css', '.standby-strip [data-kind="not-returned"]'],
  ]) {
    const rules = declarationsFor(await read(file), selector);
    assert.match(rules, /box-shadow:\s*inset/, `${file}: a missing day needs its own mark`);
    assert.doesNotMatch(rules, /background/, `${file}: a fill would read as a day the calendar speaks for`);
  }
});
