import test from 'node:test';
import assert from 'node:assert/strict';
import { getSimulatedAir } from '../server/air.mjs';
import { ALTERNATIVE_OPTIONS, compareHouseholds } from '../server/compare.mjs';

test('All alternative IDs are unique, safe, and documented', () => {
  assert.deepEqual(ALTERNATIVE_OPTIONS.map(o => o.id), ['child', 'cycling', 'fixed', 'no_budget']);
  assert.throws(() => compareHouseholds(getSimulatedAir(), {}, 'not-a-scenario'), /Choose one/);
});
test('Adding responsibility for a child yields a real rule-based recommendation difference', () => {
  const output = compareHouseholds(getSimulatedAir(), { children: false }, 'child');
  assert.equal(output.beforeProfile.children, false);
  assert.equal(output.afterProfile.children, true);
  assert.ok(output.changes.added.some(r => r.id === 'children'));
  assert.ok(output.changes.added.every(r => r.source.startsWith('https://')));
  assert.match(output.caveat, /not measured exposure/);
});
test('Fixed-schedule scenario removes suggested alternate-hour comparison', () => {
  const air = getSimulatedAir();
  const result = compareHouseholds(air, { flexibility: 'flexible' }, 'fixed', 'Asia/Kolkata');
  assert.equal(result.afterProfile.flexibility, 'fixed');
  assert.equal(result.after.bestWindow, null);
  assert.equal(result.after.departureComparisonAvailable, false);
});
test('Cycling on a very polluted day changes travel advice, not health metrics', () => {
  const result = compareHouseholds(getSimulatedAir(), { commute: 'car' }, 'cycling');
  assert.equal(result.afterProfile.commute, 'cycle');
  assert.ok(result.after.actions.find(r => r.id === 'commute').action.includes('Do not treat cycling'));
  assert.ok(result.changes.modified.some(r => r.id === 'commute'));
  assert.equal(JSON.stringify(result).includes('CO₂ saved'), false);
});
test('Already-selected alternative stays honest about no new differences', () => {
  const result = compareHouseholds(getSimulatedAir(), { children: true }, 'child');
  assert.equal(result.changedFields.length, 0);
  assert.equal(result.changes.added.length, 0);
  assert.equal(result.changes.modified.length, 0);
});
