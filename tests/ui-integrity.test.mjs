import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pm25ToUsAqi, pm10ToUsAqi, computeUsAqi, validateCoordinates } from '../server/air-math.mjs';
import { ALLOWED_STATIC, getTimezone } from '../server/http-helpers.mjs';

const FRONTEND_MODULES = [
  '../public/app.js',
  '../public/dom.js',
  '../public/chart.js',
  '../public/render.js',
  '../public/chat.js'
];

// Static integrity, NOT a substitute for a browser / accessibility audit.
test('Every hard-coded DOM ID accessed by frontend JavaScript modules is defined in HTML', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const allIds = [];
  for (const rel of FRONTEND_MODULES) {
    const src = await readFile(new URL(rel, import.meta.url), 'utf8');
    allIds.push(...Array.from(src.matchAll(/el\('([^']+)'\)/g), x => x[1]));
  }
  const missing = [...new Set(allIds)].filter(id => !html.includes(`id="${id}"`));
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
    ...FRONTEND_MODULES,
    '../public/index.html',
    '../server/ai.mjs',
    '../server/air.mjs',
    '../server/air-math.mjs',
    '../server/http-helpers.mjs',
    '../server/index.mjs'
  ];
  for (const rel of files) {
    const src = await readFile(new URL(rel, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /\binnerHTML\b|\bouterHTML\b|\binsertAdjacentHTML\b|\bdocument\.write\b/, `Unsafe DOM sink in ${rel}`);
    assert.doesNotMatch(src, /\b(?:AIza[0-9A-Za-z_-]{20,}|sk-[A-Za-z0-9_-]{20,}|AQ\.[A-Za-z0-9_-]{20,}|fbab562a[0-9a-f]{20,})\b/, `Hardcoded API key detected in ${rel}`);
  }
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i, 'Inline event handlers violate strict CSP');
});

test('Refactored server/air-math.mjs and server/http-helpers.mjs maintain strict contracts and static route coverage', () => {
  assert.equal(pm25ToUsAqi(330.1), 404);
  assert.equal(pm10ToUsAqi(154), 100);
  assert.equal(computeUsAqi(35.4, 54), 100);
  assert.deepEqual(validateCoordinates(28.61, 77.21), { lat: 28.61, lon: 77.21 });
  assert.equal(getTimezone('Asia/Kolkata'), 'Asia/Kolkata');
  assert.equal(getTimezone('Invalid/Zone'), 'UTC');
  for (const route of ['/app.js', '/dom.js', '/chart.js', '/render.js', '/chat.js']) {
    assert.equal(ALLOWED_STATIC.has(route), true, `Missing ALLOWED_STATIC entry for ${route}`);
  }
});
