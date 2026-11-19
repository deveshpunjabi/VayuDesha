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

test('Frontend and server source contain zero unsafe DOM sinks or hardcoded API keys', async () => {
  const files = [
    '../public/app.js',
    '../public/index.html',
    '../server/ai.mjs',
    '../server/air.mjs',
    '../server/index.mjs'
  ];
  for (const rel of files) {
    const src = await readFile(new URL(rel, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /\binnerHTML\b|\bouterHTML\b|\binsertAdjacentHTML\b|\bdocument\.write\b/, `Unsafe DOM sink in ${rel}`);
    assert.doesNotMatch(src, /\b(?:AIza[0-9A-Za-z_-]{20,}|sk-[A-Za-z0-9_-]{20,}|AQ\.[A-Za-z0-9_-]{20,})\b/, `Hardcoded API key detected in ${rel}`);
  }
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i, 'Inline event handlers violate strict CSP');
});
