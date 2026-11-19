/** Same pollution snapshot, two household configurations. No causal health impact estimates. */
import { buildPlan, normalizeProfile } from './decisions.mjs';

const ALTERNATIVES = Object.freeze({
  child: { label: 'Add responsibility for a child', change: { children: true } },
  cycling: { label: 'Switch the commute to cycling', change: { commute: 'cycle' } },
  fixed: { label: 'Make the daily schedule fixed', change: { flexibility: 'fixed' } },
  no_budget: { label: 'Limit the budget to free actions', change: { budget: 'free', home: 'none' } }
});
export const ALTERNATIVE_OPTIONS = Object.entries(ALTERNATIVES).map(([id, value]) => ({ id, label: value.label }));

function distilled(plan) {
  return {
    category: plan.category.name,
    actions: plan.recommendations.map(({ id, title, action, why, source, priority }) =>
      ({ id, title, action, why, source, priority })),
    bestWindow: plan.window ? { time: plan.window.time, predictedAqi: plan.window.predictedAqi } : null,
    departureComparisonAvailable: Boolean(plan.comparison)
  };
}
export function compareHouseholds(air, originalProfile, alternativeId, timezone = 'UTC', now = Date.now()) {
  const selected = ALTERNATIVES[alternativeId];
  if (!selected) throw new Error('Choose one of the available household changes.');
  const before = normalizeProfile(originalProfile);
  const after = normalizeProfile({ ...before, ...selected.change });
  const previous = distilled(buildPlan(air, before, timezone, now));
  const next = distilled(buildPlan(air, after, timezone, now));
  const oldById = new Map(previous.actions.map(action => [action.id, action]));
  const newById = new Map(next.actions.map(action => [action.id, action]));
  const added = next.actions.filter(action => !oldById.has(action.id));
  const removed = previous.actions.filter(action => !newById.has(action.id));
  const modified = next.actions.filter(action => {
    const prior = oldById.get(action.id);
    return prior && (prior.action !== action.action || prior.priority !== action.priority || prior.why !== action.why);
  }).map(action => ({ ...action, previousAction: oldById.get(action.id).action }));
  const scheduleChanged = Boolean(previous.bestWindow) !== Boolean(next.bestWindow) ||
    previous.departureComparisonAvailable !== next.departureComparisonAvailable;
  return {
    alternativeId, alternativeLabel: selected.label, beforeProfile: before, afterProfile: after,
    before: previous, after: next, changes: { added, removed, modified, scheduleChanged },
    changedFields: Object.keys(after).filter(k => before[k] !== after[k]),
    sourceType: air.sourceType,
    caveat: 'Same outdoor model data, different household assumptions. These changes represent recommendation logic, not measured exposure, health benefit, or emissions savings.'
  };
}
