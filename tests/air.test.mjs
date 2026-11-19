import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCoordinates, normalizeAir, requestJson, getSimulatedAir } from '../server/air.mjs';
import { makeGroundedPrompt, ruleBasedReply, rejectUnsafeGeneratedText } from '../server/ai.mjs';

test('coordinate validation rejects malformed, blank, and out-of-range input', () => {
  for (const [lat, lon] of [['', 1], [null, 1], [91, 1], [0, 181], ['NaN', 77], [15, 'Infinity']]) {
    assert.throws(() => validateCoordinates(lat, lon));
  }
  assert.deepEqual(validateCoordinates('28.6139', '77.2090'), { lat: 28.6139, lon: 77.2090 });
});
test('normalization does not relabel model data as CPCB readings', () => {
  const now = Date.parse('2026-11-17T10:20:00Z');
  const input = { current: { us_aqi: 160, pm2_5: 77.1, pm10: 118, time: '2026-11-17T10:00' }, hourly: {
    time: ['2026-11-17T10:00', '2026-11-17T11:00'], us_aqi: [161, 140], pm2_5: [80, 65] } };
  const air = normalizeAir(input, { lat: 28.61, lon: 77.2 }, now);
  assert.equal(air.index, 'US AQI');
  assert.equal(air.sourceType, 'model');
  assert.match(air.disclosure, /not.*Indian CPCB AQI/i);
  assert.equal(air.forecast.length, 2);
  assert.equal(air.current.pm25, 77.1);
});
test('normalization fails closed when all current values are unavailable', () => {
  assert.throws(() => normalizeAir({ current: { us_aqi: null, pm2_5: null, pm10: null } }, { lat: 0, lon: 0 }), /No usable/);
});
test('provider failure is represented as missing data, not invented values', async () => {
  await assert.rejects(requestJson('https://example.com', async () => { throw new Error('network'); }), /unreachable/);
  await assert.rejects(requestJson('https://example.com', async () => ({ ok: false })), /available/);
});
test('demo values are unmistakably marked synthetic', () => {
  const air = getSimulatedAir();
  assert.equal(air.sourceType, 'simulation');
  assert.match(air.disclosure, /DEMO ONLY/);
});
test('LLM prompt includes approved rule evidence and not the Indian AQI label', () => {
  const p = makeGroundedPrompt('How can my child avoid smog?', getSimulatedAir(), { children: true });
  assert.match(p.instructions, /Do not invent/);
  assert.match(p.input, /SIMULATION|Synthetic sample/);
  assert.match(p.input, /approvedActions/);
});
test('no-key rule-based fallback provides real actionable advice and simulation notice', () => {
  const answer = ruleBasedReply('What should my child do?', getSimulatedAir(), { children: true });
  assert.match(answer, /child|school|indoor|play/i);
  assert.match(answer, /DEMO ONLY/);
});

test('stale or missing timestamp cannot be shown as current conditions', () => {
  const now = Date.parse('2026-11-17T10:20:00Z');
  for (const time of [null, '2026-11-17T06:00', '2026-11-17T13:00']) {
    assert.throws(() => normalizeAir({ current: { us_aqi: 110, pm2_5: 54, time } }, { lat: 28.6, lon: 77.2 }, now), /recent model timestamp/);
  }
  assert.equal(normalizeAir({ current: { us_aqi: 100, time: '2026-11-17T10:00' } }, { lat: 28.6, lon: 77.2 }, now).current.aqi, 100);
});
test('whitespace coordinates do not silently become the Gulf of Guinea', () => {
  assert.throws(() => validateCoordinates(' ', '77'), /required/);
  assert.throws(() => validateCoordinates('28', '\n'), /required/);
});

test('generated-response heuristic rejects unsupported percentages and invented Indian AQI', () => {
  const air = getSimulatedAir();
  assert.equal(rejectUnsafeGeneratedText('Synthetic demo: use a well-sized purifier.', air), false);
  assert.equal(rejectUnsafeGeneratedText('It cuts your risk 75%. This is a demo.', air), true);
  assert.equal(rejectUnsafeGeneratedText('CPCB AQI is 280. This is sample data.', air), true);
  assert.equal(rejectUnsafeGeneratedText('Safe to run outdoors. This is simulated.', air), true);
  assert.equal(rejectUnsafeGeneratedText('All clear.', air), true);
});


test('Immediate serious-symptom questions get human emergency direction, not air statistics', () => {
  const reply = ruleBasedReply('My child cannot breathe', getSimulatedAir(), { children: true });
  assert.match(reply, /local emergency services immediately/i);
  assert.doesNotMatch(reply, /AQI 183|safe to go outside/i);
});
