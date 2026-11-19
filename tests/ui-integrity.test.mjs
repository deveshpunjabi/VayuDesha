import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Static integrity, NOT a substitute for a browser / accessibility audit.
test('Every hard-coded DOM ID accessed by frontend JavaScript is defined in HTML', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const ids = Array.from(app.matchAll(/el\('([^']+)'\)/g), x => x[1]);
  const missing = [...new Set(ids)].filter(id => !html.includes(`id="${id}"`));
  assert.deepEqual(missing, []);
});

test('Honest simulation and model labelling persists in the UI', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(html, /SIMULATION MODE/);
  assert.match(html, /MODELLED OUTDOOR CONDITIONS/);
  assert.match(html, /US AQI/);
  assert.match(app, /GENAI-SELECTED · EVIDENCE-LOCKED/);
  assert.match(html, /scenario-proof-title/);
});
