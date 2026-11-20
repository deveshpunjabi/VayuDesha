/**
 * Pure DOM panel renderers for observed ground stations, surface meteorology,
 * recommendations, daily routines, trade-off cards, and community briefs.
 */
import { CATEGORY_LABELS, state, el, addText, displayNumber, labelTime, safeLoad, safeSave } from './dom.js';

/** @param {number} level @returns {string} */
export function categoryText(level) {
  if (level < 0) return 'No usable AQI available.';
  if (level >= 4) return 'Pollution is elevated. Consider reducing optional outdoor exertion.';
  if (level >= 2) return 'Outdoor conditions may affect your usual daily routine.';
  return 'Check air conditions when planning outdoor activity.';
}

/** @param {Record<string, any>|null} obs */
export function renderObservedStation(obs) {
  const card = el('observed-station-card');
  const hasValue = obs && (Number.isFinite(obs.aqi) || Number.isFinite(obs.primaryValue));
  if (!hasValue) { card.classList.add('hidden'); return; }
  card.classList.remove('hidden');
  el('observed-station-name').textContent = obs.stationName || 'Ground monitoring station';
  const unitEl = el('observed-station-unit');
  if (Number.isFinite(obs.aqi)) {
    el('observed-station-aqi').textContent = displayNumber(obs.aqi);
    unitEl.textContent = 'US AQI';
  } else {
    el('observed-station-aqi').textContent = displayNumber(obs.primaryValue, 1);
    unitEl.textContent = `${(obs.dominantPollutant || 'PM25').toUpperCase()} (${obs.primaryUnit || 'µg/m³'})`;
  }
  const meta = el('observed-station-meta');
  meta.replaceChildren();
  const readingSummary = obs.readings
    ? ['pm25', 'pm10', 'no2', 'o3', 'so2', 'co'].filter(k => Number.isFinite(obs.readings[k]?.value))
      .map(k => `${k.toUpperCase()} ${obs.readings[k].value} ${obs.readings[k].unit || 'µg/m³'}`).join(' · ')
    : null;
  const parts = [
    obs.source || 'Observed ground station',
    readingSummary || (obs.dominantPollutant ? `Pollutant: ${obs.dominantPollutant.toUpperCase()}` : null),
    obs.time ? `Reported: ${labelTime(obs.time, { day: 'numeric', month: 'short' })}` : null
  ].filter(Boolean);
  meta.append(document.createTextNode(`${parts.join(' · ')} — live physical ground-monitor telemetry alongside regional CAMS model.`));
  if (typeof obs.url === 'string' && /^https?:\/\//i.test(obs.url)) {
    meta.append(document.createTextNode(' '));
    const link = document.createElement('a');
    link.href = obs.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = 'Station source';
    meta.append(link);
  }
}

/** @param {Record<string, any>|null} air */
export function renderWeather(air) {
  const w = air?.weather || null;
  el('weather-wind').textContent = Number.isFinite(w?.windSpeedKmh) ? `${w.windSpeedKmh.toFixed(1)} km/h` : '—';
  el('weather-humidity').textContent = Number.isFinite(w?.humidityPct) ? `${Math.round(w.humidityPct)}%` : '—';
  el('weather-temp').textContent = Number.isFinite(w?.temperatureC) ? `${w.temperatureC.toFixed(1)} °C` : '—';
  el('weather-pressure').textContent = Number.isFinite(w?.pressureHpa) ? `${Math.round(w.pressureHpa)} hPa` : '—';
  el('weather-dispersion').textContent = w?.dispersionNote
    || (air ? 'Surface meteorology is temporarily unavailable for this snapshot.' : 'Load a live city or sample scenario to view wind dispersion conditions.');
}

/** @param {Record<string, any>|null} comparison */
export function renderComparison(comparison) {
  const root = el('comparison-result');
  root.replaceChildren();
  if (!comparison) {
    root.textContent = 'No verified lower-PM2.5 alternative for your selected hour in the next 24 hours, or insufficient forecast data. Do not assume a safer time exists.';
    return;
  }
  addText(root, 'div', 'comparison-timing', `${labelTime(comparison.originalTime)} → ${labelTime(comparison.alternativeTime)}`);
  addText(root, 'div', 'comparison-value', `${displayNumber(comparison.deltaPm25, 1)} µg/m³ lower`);
  addText(root, 'div', 'comparison-caption', `Forecast PM2.5: ${displayNumber(comparison.originalPm25, 1)} → ${displayNumber(comparison.alternativePm25, 1)} µg/m³. ${comparison.explanation}`);
}

/** @param {Array<Record<string, any>>} actions */
export function renderActions(actions) {
  const container = el('actions-container');
  container.replaceChildren();
  const shown = actions.filter(r => state.filter === 'all' || r.category === state.filter);
  if (!shown.length) {
    addText(container, 'div', 'empty-state', 'No action cards in this category. Select All actions or choose a city.');
    return;
  }
  shown.forEach(r => {
    const card = document.createElement('article');
    card.className = 'action-card';
    const head = addText(card, 'div', 'action-header', '');
    addText(head, 'span', 'action-icon', CATEGORY_LABELS[r.category] || 'General');
    addText(head, 'span', `priority ${r.priority}`, r.priority === 'urgent' ? 'Priority' : r.priority === 'high' ? 'Worth attention' : 'Good practice');
    addText(card, 'h3', '', r.title);
    addText(card, 'p', 'body', r.action);
    addText(card, 'p', 'why', `Why: ${r.why}`);
    const impact = addText(card, 'div', 'impact-row', '');
    addText(impact, 'strong', '', 'Impact →');
    addText(impact, 'span', '', r.impact);
    const evidence = addText(card, 'p', 'evidence', 'Evidence: ');
    const link = document.createElement('a');
    link.href = r.source; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = 'Official guidance';
    evidence.append(link);
    container.append(card);
  });
}

function completionKey() {
  const location = state.simulation ? 'synthetic' : state.city ? `${state.city.name}:${state.city.country}` : 'unselected';
  return `airwise.checklist.${location}.${new Date().toISOString().slice(0, 10)}`;
}

/** Restores completed checklist items from localStorage. */
export function restoreCompleted() {
  const saved = safeLoad(completionKey());
  state.completed = new Set(Array.isArray(saved) ? saved.filter(x => typeof x === 'string').slice(0, 20) : []);
}

/** @param {Array<Record<string, any>>} recs */
export function renderChecklist(recs) {
  const root = el('brief-checklist');
  root.replaceChildren();
  const order = { urgent: 0, high: 1, normal: 2 };
  const featured = recs.slice().sort((a, b) => (order[a.priority] ?? 3) - (order[b.priority] ?? 3)).slice(0, 3);
  if (!featured.length) {
    addText(root, 'div', 'empty-state', 'Your three most useful actions appear here after a scenario loads.');
    el('brief-progress').textContent = '0 of 3 considered';
    return;
  }
  el('brief-progress').textContent = `${featured.filter(r => state.completed.has(r.id)).length} of ${featured.length} considered`;
  featured.forEach((item, index) => {
    const row = document.createElement('label');
    row.className = 'brief-task';
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = state.completed.has(item.id);
    check.setAttribute('aria-label', `Mark action ${index + 1} as considered: ${item.title}`);
    check.addEventListener('change', () => {
      if (check.checked) state.completed.add(item.id); else state.completed.delete(item.id);
      safeSave(completionKey(), [...state.completed]);
      el('brief-progress').textContent = `${featured.filter(r => state.completed.has(r.id)).length} of ${featured.length} considered`;
    });
    const words = document.createElement('div');
    addText(words, 'strong', '', item.title);
    addText(words, 'span', '', item.action);
    row.append(check, words);
    root.append(row);
  });
}

/** @param {Record<string, any>|null} routine */
export function renderRoutine(routine) {
  const root = el('routine-timeline');
  root.replaceChildren();
  el('routine-source').textContent = routine ? `${routine.dataProvenance.index} · ${routine.dataProvenance.sourceType === 'simulation' ? 'SAMPLE' : 'MODEL'}` : 'Waiting for air data';
  el('routine-notice').textContent = routine ? `${state.plan?.timingNotice || ''} Timing is a recurring daily template; verify conditions before each activity.` : 'Choose a city or sample scenario to build your day.';
  if (!Array.isArray(routine?.items) || !routine.items.length) {
    addText(root, 'li', 'empty-state', 'No routine available from this scenario.');
    return;
  }
  for (const step of routine.items) {
    const li = addText(root, 'li', 'routine-step', '');
    const time = addText(li, 'div', 'routine-time', '');
    addText(time, 'strong', '', step.approximateTime);
    addText(time, 'span', '', step.activity);
    const content = addText(li, 'div', 'routine-content', '');
    addText(content, 'h3', '', step.title);
    addText(content, 'p', '', step.action);
    addText(content, 'p', 'routine-reason', `Reason: ${step.reason}`);
    if (step.impactValueOrNull != null) addText(content, 'p', 'routine-impact', `Modelled outdoor comparison: ${step.impactValueOrNull} ${step.unitOrNull}. Not measured personal exposure.`);
    const details = addText(content, 'p', 'routine-details', `Impact: ${step.impactCategory.replaceAll('-', ' ')} · Cost: ${step.costBand} · ${step.confidence}`);
    if (step.evidenceIds?.[0]) {
      const link = document.createElement('a');
      link.href = step.evidenceIds[0]; link.rel = 'noopener noreferrer'; link.target = '_blank'; link.textContent = 'Evidence';
      details.append(' · ', link);
    }
  }
}

/** @param {Record<string, any>|null} data */
export function renderChoices(data) {
  const root = el('choice-cards');
  root.replaceChildren();
  el('choices-headline').textContent = data?.guidance || 'Explore trade-offs between exposure, emissions and real-world constraints.';
  el('choices-methodology').textContent = data?.methodology || 'Comparisons are qualitative, not measured personal exposure or route safety.';
  if (!Array.isArray(data?.choices)) {
    addText(root, 'div', 'empty-state', 'Decision comparisons appear after loading a scenario.');
    return;
  }
  for (const item of data.choices) {
    const card = document.createElement('article');
    card.className = `choice-card fit-${item.fit}`;
    const head = addText(card, 'div', 'choice-card-top', '');
    addText(head, 'h3', '', item.title);
    addText(head, 'span', 'choice-tag', item.tag);
    const factors = addText(card, 'div', 'choice-factors', '');
    for (const [label, value] of [['Exposure', item.exposure], ['Emissions', item.emissions], ['Cost', item.cost]]) {
      const line = addText(factors, 'div', '', '');
      addText(line, 'span', '', label);
      addText(line, 'span', '', value);
    }
    addText(card, 'p', 'choice-reason', item.reasoning);
    if (item.directImpact) addText(card, 'p', 'choice-reason', `Direct impact: ${item.directImpact}`);
    addText(card, 'p', 'choice-caveat', `Limit: ${item.limitation}`);
    const evidence = addText(card, 'p', 'choice-evidence', '');
    const link = document.createElement('a');
    link.href = item.source; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = 'Check source guidance';
    evidence.append(link);
    root.append(card);
  }
}

/** @param {Array<Record<string, string>>} actions */
export function renderCommunity(actions) {
  const root = el('community-cards');
  root.replaceChildren();
  if (!Array.isArray(actions) || !actions.length) {
    addText(root, 'div', 'empty-state', 'The community playbook appears after you load air-quality data.');
    return;
  }
  for (const item of actions) {
    const card = document.createElement('article');
    card.className = 'community-card';
    addText(card, 'span', 'eyebrow', item.audience);
    addText(card, 'h3', '', item.title);
    addText(card, 'p', '', item.action);
    const link = document.createElement('a');
    link.href = item.source; link.rel = 'noopener noreferrer'; link.target = '_blank'; link.textContent = 'Evidence & context';
    card.append(link);
    root.append(card);
  }
}

/** @param {Record<string, any>} result */
export function showComparison(result) {
  const root = el('scenario-result');
  root.replaceChildren();
  addText(root, 'h3', '', result.alternativeLabel);
  if (!result.changedFields?.length) {
    addText(root, 'p', '', 'No household preferences changed. The recommendation engine correctly kept the plan unchanged.');
    return;
  }
  addText(root, 'p', '', `Compared under exactly the same ${result.sourceType === 'simulation' ? 'synthetic' : 'modelled'} outdoor conditions. Changed fields: ${result.changedFields.join(', ')}.`);
  const grid = addText(root, 'div', 'proof-changes', '');
  for (const [label, side] of [['Before · Your current settings', result.before], ['After · New circumstances', result.after]]) {
    const tile = addText(grid, 'div', 'proof-tile', '');
    addText(tile, 'strong', '', label);
    addText(tile, 'p', '', `Household actions: ${side.actions.length}`);
    addText(tile, 'small', '', side.bestWindow ? 'Flexible timing advice available where forecast permits.' : 'No alternate-time guidance available.');
  }
  const delta = result.changes;
  const changes = [
    ...delta.added.map(a => `Added: ${a.title} — ${a.action}`),
    ...delta.removed.map(a => `Removed: ${a.title}`),
    ...delta.modified.map(a => `Adapted: ${a.title} — ${a.action}`),
    ...(delta.scheduleChanged ? ['Time advice changed because schedule constraints changed.'] : [])
  ];
  if (!changes.length) addText(root, 'p', '', 'The tested advice remained the same under this one-field change. This is a valid result.');
  else changes.slice(0, 6).forEach(message => addText(root, 'p', 'proof-item', message));
  addText(root, 'p', 'small muted', result.caveat);
}
