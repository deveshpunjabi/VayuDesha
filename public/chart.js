/**
 * US EPA 6-band scale marker, pollutant bar proportions, 24-hour SVG forecast chart,
 * room air-cleaner planner, and plain-text brief downloaders.
 */
import { state, el, addText, makeSvg, labelTime, displayNumber, post } from './dom.js';

const CHART_WIDTH = 920;
const CHART_HEIGHT = 220;
const PAD_LEFT = 44;
const PAD_RIGHT = 22;
const PAD_TOP = 18;
const PAD_BOTTOM = 26;
const SCALE_BANDS = Object.freeze([
  Object.freeze([0, 50, 0, 100 / 6]),
  Object.freeze([50, 100, 100 / 6, 200 / 6]),
  Object.freeze([100, 150, 200 / 6, 300 / 6]),
  Object.freeze([150, 200, 300 / 6, 400 / 6]),
  Object.freeze([200, 300, 400 / 6, 500 / 6]),
  Object.freeze([300, 500, 500 / 6, 100])
]);

const POLLUTANT_BAR_SPECS = Object.freeze([
  Object.freeze(['pm25-bar', 'pm25', 150, 35, 75]),
  Object.freeze(['pm10-bar', 'pm10', 250, 50, 150]),
  Object.freeze(['no2-bar', 'no2', 200, 40, 100]),
  Object.freeze(['o3-bar', 'o3', 180, 60, 120]),
  Object.freeze(['so2-bar', 'so2', 150, 20, 80]),
  Object.freeze(['co-bar', 'co', 6000, 1500, 4000])
]);

/** @param {Record<string, any>|null} air */
export function renderPollutantNumbersAndBars(air) {
  el('pm25-number').textContent = displayNumber(air?.current?.pm25, 1);
  el('pm10-number').textContent = displayNumber(air?.current?.pm10, 1);
  el('no2-number').textContent = displayNumber(air?.current?.no2, 1);
  el('o3-number').textContent = displayNumber(air?.current?.o3, 1);
  el('so2-number').textContent = displayNumber(air?.current?.so2, 1);
  el('co-number').textContent = displayNumber(air?.current?.co, 0);
  for (const [id, field, max, mid, high] of POLLUTANT_BAR_SPECS) {
    const bar = el(id);
    const val = air?.current?.[field];
    if (!bar) continue;
    if (!Number.isFinite(val)) {
      bar.style.width = '0%';
      bar.style.background = '#9CA3AF';
    } else {
      bar.style.width = `${Math.max(6, Math.min(100, (val / max) * 100)).toFixed(0)}%`;
      bar.style.background = val >= high ? '#DC2626' : val >= mid ? '#D97706' : '#059669';
    }
  }
}

/** @param {number} aqi @returns {number} */
export function aqiToScalePercent(aqi) {
  const clamped = Math.max(0, Math.min(500, aqi));
  for (const [lo, hi, pLo, pHi] of SCALE_BANDS) {
    if (clamped <= hi) {
      const ratio = hi === lo ? 0 : (clamped - lo) / (hi - lo);
      return Math.max(1.5, Math.min(98.5, pLo + ratio * (pHi - pLo)));
    }
  }
  return 98.5;
}

/** @param {number|null|undefined} aqi */
export function renderScaleMarker(aqi) {
  const marker = el('aqi-scale-marker');
  if (!Number.isFinite(aqi)) { marker.classList.add('hidden'); return; }
  marker.classList.remove('hidden');
  marker.style.left = `${aqiToScalePercent(aqi).toFixed(1)}%`;
}

function drawChartGrid(chart, minVal, maxVal, yFn) {
  for (let i = 0; i < 4; i++) {
    const tick = minVal + ((maxVal - minVal) * i) / 3;
    const yy = yFn(tick);
    chart.append(makeSvg('line', {
      x1: PAD_LEFT, x2: CHART_WIDTH - PAD_RIGHT, y1: yy.toFixed(1), y2: yy.toFixed(1),
      stroke: '#E2E8F0', 'stroke-width': 1, 'stroke-dasharray': i === 0 ? 'none' : '4 6'
    }));
    chart.append(makeSvg('text', {
      x: 4, y: (yy + 4).toFixed(1), fill: '#64748B', 'font-size': 11, 'font-family': 'ui-monospace, Consolas, monospace'
    }, String(Math.round(tick))));
  }
}

function drawChartCurves(chart, points, xFn, yFn) {
  const coords = points.map((p, i) => [xFn(i), yFn(p.aqi)]);
  const line = coords.map(([xx, yy], i) => `${i ? 'L' : 'M'} ${xx.toFixed(1)} ${yy.toFixed(1)}`).join(' ');
  const baseY = CHART_HEIGHT - PAD_BOTTOM;
  const defs = makeSvg('defs');
  const gradient = makeSvg('linearGradient', { id: 'chart-gradient', x1: '0%', y1: '0%', x2: '0%', y2: '100%' });
  gradient.append(makeSvg('stop', { offset: '0%', 'stop-color': '#111827', 'stop-opacity': '0.14' }));
  gradient.append(makeSvg('stop', { offset: '100%', 'stop-color': '#111827', 'stop-opacity': '0.01' }));
  defs.append(gradient);
  chart.append(defs);
  chart.append(makeSvg('path', { d: `${line} L ${xFn(points.length - 1).toFixed(1)} ${baseY} L ${xFn(0).toFixed(1)} ${baseY} Z`, fill: 'url(#chart-gradient)' }));
  chart.append(makeSvg('path', { d: line, class: 'chart-line-animated', fill: 'none', stroke: '#111827', 'stroke-width': 2.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
}

function formatPointTooltip(point, prefix = '') {
  const timeStr = labelTime(point.time, { weekday: 'short' });
  const pmStr = Number.isFinite(point.pm25) ? ` · PM2.5 ${point.pm25.toFixed(1)} µg/m³` : '';
  return `${prefix}${timeStr} · US AQI ${Math.round(point.aqi)}${pmStr}`;
}

function drawChartPoints(chart, tooltip, points, lowIndex, xFn, yFn) {
  const defaultTooltip = formatPointTooltip(points[lowIndex], 'Lowest modelled: ');
  tooltip.textContent = defaultTooltip;
  points.forEach((point, i) => {
    const isLowest = i === lowIndex;
    const label = formatPointTooltip(point);
    const circle = makeSvg('circle', {
      cx: xFn(i).toFixed(1), cy: yFn(point.aqi).toFixed(1), r: isLowest ? 6 : 4,
      fill: isLowest ? '#2563EB' : '#FFFFFF', stroke: '#2563EB', 'stroke-width': isLowest ? 3 : 2,
      class: 'chart-point', tabindex: '0', role: 'button', 'aria-label': label
    });
    circle.append(makeSvg('title', {}, label));
    const highlight = () => { circle.setAttribute('r', '7'); tooltip.textContent = label; };
    const reset = () => { circle.setAttribute('r', isLowest ? '6' : '4'); tooltip.textContent = defaultTooltip; };
    circle.addEventListener('pointerenter', highlight);
    circle.addEventListener('focus', highlight);
    circle.addEventListener('click', highlight);
    circle.addEventListener('pointerleave', reset);
    circle.addEventListener('blur', reset);
    chart.append(circle);
  });
}

/** @param {Array<Record<string, any>>} forecast */
export function renderChart(forecast) {
  const chart = el('forecast-chart');
  const tooltip = el('forecast-tooltip');
  chart.replaceChildren();
  const points = (Array.isArray(forecast) ? forecast : [])
    .filter(p => p.time && Number.isFinite(p.aqi) && Date.parse(p.time) < Date.now() + 24 * 3600_000)
    .slice(0, 24);
  if (!points.length) {
    chart.append(makeSvg('text', { x: 28, y: 112, fill: '#64748B', 'font-size': 16 }, 'No forecast data available'));
    el('forecast-hours').replaceChildren();
    el('forecast-text').textContent = 'No usable hourly forecast available.';
    tooltip.textContent = 'No hourly points available';
    return;
  }
  const lowest = Math.min(...points.map(p => p.aqi));
  const highest = Math.max(...points.map(p => p.aqi));
  const minVal = Math.max(0, Math.floor((lowest - 25) / 25) * 25);
  const maxVal = Math.max(minVal + 25, Math.ceil((highest + 25) / 25) * 25);
  const xFn = i => PAD_LEFT + (i * (CHART_WIDTH - PAD_LEFT - PAD_RIGHT)) / Math.max(1, points.length - 1);
  const yFn = val => PAD_TOP + ((maxVal - val) * (CHART_HEIGHT - PAD_TOP - PAD_BOTTOM)) / (maxVal - minVal);
  drawChartGrid(chart, minVal, maxVal, yFn);
  drawChartCurves(chart, points, xFn, yFn);
  drawChartPoints(chart, tooltip, points, points.findIndex(p => p.aqi === lowest), xFn, yFn);
  el('forecast-hours').replaceChildren();
  for (const idx of [...new Set([0, Math.floor((points.length - 1) / 3), Math.floor(((points.length - 1) * 2) / 3), points.length - 1])]) {
    const span = document.createElement('span');
    span.textContent = labelTime(points[idx].time, { weekday: 'short' });
    el('forecast-hours').append(span);
  }
  el('forecast-text').textContent = `Modelled U.S. AQI ranges from ${Math.round(lowest)} to ${Math.round(highest)} in the visible 24-hour forecast. Actual neighborhood conditions may differ.`;
}

function downloadTextFile(filename, content) {
  if (!content) return;
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

/** Downloads the anonymous community air briefing. */
export function downloadCommunity() {
  const brief = state.communityBrief;
  if (!brief) return;
  downloadTextFile('vayudesha-community-brief.txt', [
    'VAYUDESHA · COMMUNITY AIR BRIEF', `Date: ${brief.date} · ${brief.timezone}`,
    `Source: ${brief.source} | Type: ${brief.sourceType} | Index: ${brief.index}`,
    `Model timestamp: ${brief.modelTimestamp ?? 'Unavailable'}`, `AQI: ${brief.value ?? 'Unavailable'} · ${brief.category}`,
    ...(brief.simulated ? ['DEMO ONLY — SYNTHETIC DATA. NOT CURRENT CONDITIONS.'] : []), '',
    ...brief.actions.map((x, i) => `${i + 1}. ${x.title}\n${x.action}\nEvidence: ${x.evidenceUrl}`), '', brief.disclaimer
  ].join('\n'));
}

/** Downloads the personalized daily air brief. */
export function downloadBrief() {
  if (!state.air || !state.plan) return;
  const c = state.air.current || {};
  const w = state.air.weather;
  downloadTextFile('vayudesha-daily-brief.txt', [
    'VAYUDESHA · PERSONAL DAILY AIR BRIEF',
    `Place: ${state.simulation ? 'SAMPLE SIMULATION (NOT LIVE)' : [state.city?.name, state.city?.country].filter(Boolean).join(', ')}`,
    `Data: ${state.air.source} | Type: ${state.air.sourceType} | Index: ${state.air.index}`,
    `Model time: ${c.time} | Retrieved: ${state.air.retrievedAt}`,
    `US AQI: ${c.aqi ?? 'Unavailable'} | PM2.5 (µg/m³): ${c.pm25 ?? 'Unavailable'} | PM10 (µg/m³): ${c.pm10 ?? 'Unavailable'}`,
    `Trace gases (µg/m³): NO2 ${c.no2 ?? '—'} | O3 ${c.o3 ?? '—'} | SO2 ${c.so2 ?? '—'} | CO ${c.co ?? '—'}`,
    ...(w ? [`Meteorology (${w.source}): Wind ${w.windSpeedKmh ?? '—'} km/h | Humidity ${w.humidityPct ?? '—'}% | Temp ${w.temperatureC ?? '—'} °C | ${w.dispersionNote}`] : []),
    `Status: ${state.plan.category.name}`, `Summary: ${state.plan.headline}`, '',
    'MY CLEAN-AIR DAY (APPROXIMATE ROUTINE TEMPLATE)',
    ...((state.routine?.items || []).map((x, i) => `${i + 1}. ${x.approximateTime} ${x.activity}: ${x.action} [${x.impactCategory}]. Evidence: ${x.evidenceIds.join(', ')}`)),
    `Timing limitations: ${state.plan.timingNotice}`, '', 'YOUR ACTION PLAN',
    ...state.plan.recommendations.map((r, i) => `${i + 1}. ${r.title}\nAction: ${r.action}\nWhy: ${r.why}\nLikely impact: ${r.impact}\nSource: ${r.source}\n`),
    '', 'TRADE-OFFS',
    ...((state.choices?.choices || []).map(ch => `${ch.title}: Exposure: ${ch.exposure}; Emissions: ${ch.emissions}; Cost: ${ch.cost}. ${ch.limitation}`)),
    '', 'LIMITATIONS', state.air.disclosure, ...state.plan.disclaimers,
    'This report is informational, does not assess personal medical needs, and does not measure your indoor air or personal exposure.'
  ].join('\n'));
}

/** Executes the room air-cleaner and source-control planner request. */
export async function runRoomPlan() {
  el('room-plan-result').replaceChildren();
  try {
    const { roomPlan } = await post('/room-plan', { area: el('room-area').value, home: el('home').value, budget: el('budget').value, source: el('room-source').value });
    el('cadr-result').textContent = `Suggested smoke CADR: ${roomPlan.smokeCadrEstimate.value} ${roomPlan.smokeCadrEstimate.unit}. ${roomPlan.smokeCadrEstimate.assumption}`;
    const root = el('room-plan-result');
    for (const action of roomPlan.actions) {
      const row = addText(root, 'div', 'room-action', '');
      addText(row, 'strong', '', action.title);
      addText(row, 'p', '', action.advice);
      const link = document.createElement('a');
      link.href = action.source; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = 'Read source';
      row.append(link);
    }
    addText(root, 'p', 'small muted', roomPlan.limitations.join(' '));
  } catch (error) {
    el('cadr-result').textContent = error.message;
  }
}
