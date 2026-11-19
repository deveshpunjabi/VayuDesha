import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChoices, buildCommunityActions } from '../server/choices.mjs';
import { buildPlan, normalizeProfile } from '../server/decisions.mjs';
import { getSimulatedAir } from '../server/air.mjs';

const air = aqi => ({ current: { aqi }, forecast: [] });
test('Decision lab does not promote cycling on a polluted day', () => {
  const data = buildChoices(air(185), { commute: 'cycle' });
  const active = data.choices.find(c => c.id === 'active');
  assert.equal(active.fit, 'caution');
  assert.match(active.reasoning, /inhalation|exertion/i);
  assert.match(data.methodology, /not personalized exposure measurement/i);
});
test('Lower pollution permits consideration without a guarantee', () => {
  const result = buildChoices(air(45), { commute: 'cycle' });
  assert.equal(result.choices.find(c => c.id === 'active').fit, 'possible');
  assert.match(result.choices.find(c => c.id === 'active').reasoning, /not zero risk/i);
});
test('Fixed schedules suppress impractical suggested timing', () => {
  const result = buildChoices(air(180), { flexibility: 'fixed' });
  assert.equal(result.choices.find(c => c.id === 'reschedule').fit, 'limited');
  assert.equal(buildPlan(getSimulatedAir(), { flexibility: 'fixed' }).window, null);
});
test('Community actions react to high AQI and preserve uncertainty', () => {
  const result = buildCommunityActions(air(210), { flexibility: 'fixed' });
  assert.equal(result.length, 3);
  assert.match(result[0].action, /school/i);
  assert.match(result[2].action, /cannot move/i);
});
test('Null or malformed profile never escapes normalization', () => {
  for (const profile of [null, [], undefined, 10, 'bad']) {
    assert.equal(normalizeProfile(profile).flexibility, 'limited');
    assert.equal(buildChoices(air(100), profile).choices.length, 4);
  }
});
test('Decision lab never asserts fabricated risk or CO2 savings', () => {
  const text = JSON.stringify(buildChoices(air(300), { budget: 'free' }));
  assert.doesNotMatch(text, /\d+\s*%/);
  assert.doesNotMatch(text, /\d+(?:\.\d+)?\s*(?:kg|g)\s*CO2/i);
});
test('Data-empty decision lab cannot imply low pollution', () => {
  const result = buildChoices({ current: { aqi: null } });
  assert.equal(result.category, 'Unavailable');
  assert.equal(result.choices.find(c => c.id === 'active').fit, 'caution');
  assert.match(result.guidance, /unavailable/i);
});
