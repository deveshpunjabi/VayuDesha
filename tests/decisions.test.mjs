import test from 'node:test';
import assert from 'node:assert/strict';
import { categoryForUsAqi, normalizeProfile, buildPlan, recommendWindow, compareRoutine, minimumSmokeCadr, avoidedMotorizedDistance } from '../server/decisions.mjs';
import { getSimulatedAir } from '../server/air.mjs';

const categories = [
  [0, 0], [50, 0], [51, 1], [100, 1], [101, 2], [150, 2],
  [151, 3], [200, 3], [201, 4], [300, 4], [301, 5], [550, 5]
];
for (const [aqi, expected] of categories) test(`US AQI ${aqi} maps to evidence category ${expected}`, () => {
  assert.equal(categoryForUsAqi(aqi).level, expected);
});
test('unavailable AQI does not silently imply clean air', () => {
  assert.equal(categoryForUsAqi(null).level, -1);
  assert.equal(categoryForUsAqi(-2).level, -1);
  const air = { current: { aqi: null }, forecast: [] };
  assert.match(buildPlan(air).recommendations[0].action, /Check local official/i);
});
test('unknown profile data is narrowed to allowed values', () => {
  assert.deepEqual(normalizeProfile({ children: 'true', commute: '<script>', budget: 'gold', home: 'unknown', usualHour: 99 }),
    { children: false, extraCare: false, commute: 'transit', budget: 'free', home: 'none', flexibility: 'limited', usualHour: 8, outdoorHour: 16, cookingHour: 19, maxShiftMinutes: 15 });
});
test('children receive a tailored play recommendation', () => {
  const plan = buildPlan({ current: { aqi: 132 }, forecast: [] }, { children: true });
  assert.ok(plan.recommendations.find(item => item.id === 'children'));
  assert.equal(plan.category.level, 2);
});
test('high-AQI cycling is not automatically promoted as safe', () => {
  const plan = buildPlan({ current: { aqi: 190 }, forecast: [] }, { commute: 'cycle' });
  assert.match(plan.recommendations.find(item => item.id === 'commute').action, /less strenuous/i);
});
test('existing filtration is accommodated without promising a percentage', () => {
  const plan = buildPlan({ current: { aqi: 185 }, forecast: [] }, { home: 'purifier' });
  assert.match(plan.recommendations.find(item => item.id === 'filtration').action, /maintenance/i);
  assert.doesNotMatch(JSON.stringify(plan.recommendations), /\d+\s*%/);
});
test('simulation disclaimer is carried into the plan', () => {
  const plan = buildPlan(getSimulatedAir());
  assert.ok(plan.disclaimers.some(x => x.includes('simulation')));
});
test('recommend window rejects overnight hours and selects lower daytime AQI', () => {
  const now = Date.parse('2026-11-17T05:00:00Z');
  const values = [
    { time: '2026-11-17T06:00:00Z', aqi: 2, pm25: 1 },
    { time: '2026-11-17T08:00:00Z', aqi: 130, pm25: 80 },
    { time: '2026-11-17T13:00:00Z', aqi: 95, pm25: 50 }
  ];
  assert.equal(recommendWindow(values, 'UTC', now).predictedAqi, 95);
});
test('comparison only uses a future same-day daytime alternative and reports concentration difference', () => {
  const now = Date.parse('2026-11-17T06:00:00Z');
  const hours = [
    { time: '2026-11-17T08:00:00Z', aqi: 170, pm25: 85 },
    { time: '2026-11-17T13:00:00Z', aqi: 130, pm25: 54 },
    { time: '2026-11-18T02:00:00Z', aqi: 50, pm25: 10 }
  ];
  const comparison = compareRoutine(hours, 'UTC', 8, now);
  assert.equal(comparison.deltaPm25, 31);
  assert.equal(comparison.alternativeTime, hours[1].time);
  assert.match(comparison.explanation, /not measured personal exposure/i);
});
test('comparison returns no improvement if the usual hour is already best', () => {
  const now = Date.parse('2026-11-17T06:00:00Z');
  assert.equal(compareRoutine([
    { time: '2026-11-17T08:00:00Z', aqi: 55, pm25: 12 },
    { time: '2026-11-17T10:00:00Z', aqi: 95, pm25: 30 }
  ], 'UTC', 8, now), null);
});
test('EPA smoke CADR sizing unit conversion and limits', () => {
  assert.equal(minimumSmokeCadr(15), 190);
  assert.throws(() => minimumSmokeCadr(-1), /Room area/);
  assert.throws(() => minimumSmokeCadr('oops'), /Room area/);
  assert.throws(() => minimumSmokeCadr(500), /Room area/);
});

test('invalid profile types safely revert to defaults', () => {
  for (const input of [null, [], 'bad', 40]) assert.equal(normalizeProfile(input).commute, 'transit');
});
test('blank room area must not be interpreted as zero', () => {
  assert.throws(() => minimumSmokeCadr(' '), /Room area/);
});
test('travel activity impact is auditable and not falsely presented as emissions', () => {
  const result = avoidedMotorizedDistance(8, 3, 'scooter');
  assert.equal(result.vehicleKilometresNotDriven, 48);
  assert.match(result.caveat, /not measured CO₂/);
  for (const bad of [[-1, 1, 'car'], [6, 0, 'car'], [3, 1.3, 'car'], [3, 2, 'transit']]) {
    assert.throws(() => avoidedMotorizedDistance(...bad));
  }
});
