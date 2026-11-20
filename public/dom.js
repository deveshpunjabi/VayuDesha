/**
 * Shared frontend state, DOM/SVG element builders, time/number formatters,
 * localStorage persistence, API client, and Household Profile Drawer helpers.
 */

export const API = '/api';
export const TABS = Object.freeze(['live', 'plan', 'indoor', 'community']);
export const PROFILE_FIELDS = Object.freeze([
  'children', 'extra-care', 'commute', 'budget', 'home',
  'usual-hour', 'flexibility', 'max-shift', 'outdoor-hour', 'cooking-hour'
]);

export const COMMUTE_LABELS = Object.freeze({ transit: 'Transit', scooter: 'Scooter', car: 'Car', walk: 'Walk', cycle: 'Cycle', remote: 'Remote' });
export const FLEX_LABELS = Object.freeze({ fixed: 'Fixed', limited: 'Limited', flexible: 'Flexible' });
export const HOME_LABELS = Object.freeze({ none: '', fan: 'Fan', purifier: 'Purifier' });
export const CATEGORY_LABELS = Object.freeze({ outdoor: 'Outdoors', home: 'At home', travel: 'Travel', family: 'Family' });

export const PERSONA_PRESETS = Object.freeze({
  family: Object.freeze({ children: true, extraCare: false, commute: 'scooter', budget: 'low', home: 'none', usualHour: 8, flexibility: 'limited' }),
  cyclist: Object.freeze({ children: false, extraCare: false, commute: 'cycle', budget: 'free', home: 'none', usualHour: 9, flexibility: 'flexible' }),
  fixed: Object.freeze({ children: false, extraCare: true, commute: 'transit', budget: 'free', home: 'fan', usualHour: 7, flexibility: 'fixed' }),
  budget: Object.freeze({ children: true, extraCare: false, commute: 'walk', budget: 'free', home: 'none', usualHour: 8, flexibility: 'fixed' })
});

export const state = {
  view: 'landing', activeTab: 'live', city: null, simulation: false, demoScenario: 'unhealthy',
  air: null, plan: null, routine: null, communityBrief: null, choices: null, community: [],
  pulseCities: [], filter: 'all', busy: false, requestId: 0, searchId: 0, completed: new Set(),
  aiConfigured: false, aiProvider: null, aiModel: null, eventSource: null, streamMode: 'idle',
  lastUpdatedAt: null, fallbackPollTimer: null, tickerTimer: null, lastPlanSignature: null
};

/** @param {string} id @returns {HTMLElement|null} */
export const el = id => document.getElementById(id);

/** @param {string} key @returns {any} */
export function safeLoad(key) {
  try { return JSON.parse(localStorage.getItem(key)); }
  catch (_err) { return null; }
}

/** @param {string} key @param {any} value */
export function safeSave(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch (_err) { /* ignore storage restrictions */ }
}

/** @returns {Record<string, any>} */
export function profile() {
  return {
    children: el('children').checked,
    extraCare: el('extra-care').checked,
    commute: el('commute').value,
    budget: el('budget').value,
    home: el('home').value,
    usualHour: Number(el('usual-hour').value),
    flexibility: el('flexibility').value,
    maxShiftMinutes: el('max-shift').value === '' ? undefined : Number(el('max-shift').value),
    outdoorHour: Number(el('outdoor-hour').value),
    cookingHour: Number(el('cooking-hour').value)
  };
}

/** @returns {string} */
export function timezone() {
  return state.city?.timezone || 'Asia/Kolkata';
}

/** @param {string|null|undefined} iso @param {Intl.DateTimeFormatOptions} [opts={}] @returns {string} */
export function labelTime(iso, opts = {}) {
  if (!iso) return 'Unknown time';
  try { return new Intl.DateTimeFormat('en-IN', { timeZone: timezone(), hour: 'numeric', minute: '2-digit', ...opts }).format(new Date(iso)); }
  catch (_err) { return new Date(iso).toUTCString(); }
}

/** @param {number|null|undefined} value @param {number} [digits=0] @returns {string} */
export function displayNumber(value, digits = 0) {
  return Number.isFinite(value) ? value.toFixed(digits) : '—';
}

/** @param {number|null|undefined} timestampMs @returns {string} */
export function formatRelativeAge(timestampMs) {
  if (!Number.isFinite(timestampMs)) return 'just now';
  const diffSec = Math.max(0, Math.floor((Date.now() - timestampMs) / 1000));
  if (diffSec < 45) return 'just now';
  const mins = Math.floor(diffSec / 60);
  return mins < 60 ? `${mins}m ago` : `${Math.floor(mins / 60)}h ago`;
}

/** @param {HTMLElement} parent @param {string} tag @param {string} className @param {string} value @returns {HTMLElement} */
export function addText(parent, tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = value;
  parent.append(node);
  return node;
}

/** @param {string} tag @param {Record<string, string|number>} [attrs={}] @param {string} [text] @returns {SVGElement} */
export function makeSvg(tag, attrs = {}, text) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
  if (text != null) node.textContent = text;
  return node;
}

/** @param {string} message */
export function status(message) {
  el('status-message').textContent = message;
}

/** @param {string} endpoint @param {RequestInit} [options] @returns {Promise<any>} */
export async function api(endpoint, options) {
  const response = await fetch(`${API}${endpoint}`, options);
  let body;
  try { body = await response.json(); }
  catch (_err) { throw new Error('Server returned an unreadable response.'); }
  if (!response.ok) throw new Error(body.error || 'Request failed.');
  return body;
}

/** @param {string} path @param {Record<string, any>} body @returns {Promise<any>} */
export function post(path, body) {
  return api(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

/** @returns {Record<string, any>} */
export function requestContext() {
  return {
    simulation: state.simulation, demoScenario: state.demoScenario,
    lat: state.city?.latitude, lon: state.city?.longitude,
    timezone: timezone(), profile: profile()
  };
}

/** @param {Record<string, any>|null} air @returns {string} */
export function airSignature(air) {
  if (!air) return '';
  return [air.sourceType, air.current?.time, air.current?.aqi, air.current?.pm25, air.weather?.windSpeedKmh, air.observedStation?.aqi].join('|');
}

/** @param {boolean} value */
export function setBusy(value) {
  state.busy = value;
  el('refresh-button').disabled = value || (!state.city && !state.simulation);
  el('send-button').disabled = value;
  el('chat-input').disabled = value;
  el('download-brief').disabled = value || !state.air;
  el('print-brief').disabled = value || !state.air;
  el('scenario-button').disabled = value || !state.air;
  el('download-community').disabled = value || !state.communityBrief;
}

/** Updates header profile summary pill. */
export function updateProfileSummary() {
  const p = profile();
  const lead = p.children && p.extraCare ? 'Family + Care' : p.children ? 'Family' : p.extraCare ? 'Extra care' : 'Standard';
  const parts = [lead, COMMUTE_LABELS[p.commute] || 'Transit', FLEX_LABELS[p.flexibility] || 'Limited'];
  if (HOME_LABELS[p.home]) parts.push(HOME_LABELS[p.home]);
  el('profile-summary-pill').textContent = parts.join(' · ');
}

let drawerCloseTimer = null;

/** Opens the slide-over Household Profile Drawer. */
export function openProfileDrawer() {
  const drawer = el('profile');
  const backdrop = el('profile-backdrop');
  if (drawerCloseTimer) { clearTimeout(drawerCloseTimer); drawerCloseTimer = null; }
  drawer.classList.remove('hidden');
  backdrop.classList.remove('hidden');
  drawer.setAttribute('aria-hidden', 'false');
  el('open-profile-btn').setAttribute('aria-expanded', 'true');
  requestAnimationFrame(() => { drawer.classList.add('is-open'); backdrop.classList.add('is-open'); });
  el('close-profile-btn').focus();
}

/** @param {{ restoreFocus?: boolean }} [opts={}] */
export function closeProfileDrawer({ restoreFocus = true } = {}) {
  const drawer = el('profile');
  const backdrop = el('profile-backdrop');
  const trigger = el('open-profile-btn');
  const wasOpen = drawer.classList.contains('is-open') || !drawer.classList.contains('hidden');
  drawer.classList.remove('is-open');
  backdrop.classList.remove('is-open');
  drawer.setAttribute('aria-hidden', 'true');
  trigger.setAttribute('aria-expanded', 'false');
  const finalize = () => { drawer.classList.add('hidden'); backdrop.classList.add('hidden'); };
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) finalize();
  else drawerCloseTimer = setTimeout(finalize, 280);
  if (wasOpen && restoreFocus) trigger.focus();
}

/** Resets household profile controls to default values. */
export function resetProfileDefaults() {
  el('children').checked = false; el('extra-care').checked = false;
  el('commute').value = 'transit'; el('budget').value = 'free'; el('home').value = 'none';
  el('usual-hour').value = '8'; el('flexibility').value = 'limited'; el('max-shift').value = '';
  el('outdoor-hour').value = '16'; el('cooking-hour').value = '19';
  document.querySelectorAll('[data-persona]').forEach(b => b.classList.remove('selected'));
  updateProfileSummary();
}

/**
 * Switches active dashboard sub-tab and updates URL hash when on dashboard.
 * @param {string} tabName
 * @param {{ focusTab?: boolean, updateHash?: boolean }} [opts={}]
 */
export function switchTab(tabName, { focusTab = false, updateHash = true } = {}) {
  const target = TABS.includes(tabName) ? tabName : 'live';
  state.activeTab = target;
  document.querySelectorAll('[data-tab]').forEach(btn => {
    const active = btn.dataset.tab === target;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
    btn.setAttribute('tabindex', active ? '0' : '-1');
    if (active && focusTab) btn.focus();
  });
  for (const t of TABS) el(`tab-${t}`).classList.toggle('hidden', t !== target);
  if (updateHash && state.view === 'dashboard') {
    const targetHash = target === 'live' ? '#dashboard' : `#${target}`;
    if (window.location.hash !== targetHash) {
      try { history.replaceState(null, '', targetHash); }
      catch (_err) { /* ignore history API restrictions */ }
    }
  }
}

/**
 * Switches between 'landing' and 'dashboard' views.
 * @param {'landing'|'dashboard'} view
 * @param {string|null} [tabName=null]
 * @param {{ updateHash?: boolean }} [opts={}]
 */
export function showView(view, tabName = null, { updateHash = true } = {}) {
  const isDashboard = view === 'dashboard';
  state.view = isDashboard ? 'dashboard' : 'landing';
  el('landing-view').classList.toggle('hidden', isDashboard);
  el('dashboard-view').classList.toggle('hidden', !isDashboard);
  el('nav-home-btn').classList.toggle('active', !isDashboard);
  el('nav-dashboard-btn').classList.toggle('active', isDashboard);
  if (isDashboard) {
    el('nav-home-btn').removeAttribute('aria-current');
    el('nav-dashboard-btn').setAttribute('aria-current', 'page');
    switchTab(tabName || state.activeTab || 'live', { updateHash });
  } else {
    el('nav-dashboard-btn').removeAttribute('aria-current');
    el('nav-home-btn').setAttribute('aria-current', 'page');
    if (updateHash && window.location.hash !== '#overview' && window.location.hash !== '') {
      try { history.replaceState(null, '', '#overview'); }
      catch (_err) { /* ignore history API restrictions */ }
    }
  }
}

/**
 * Applies a quick household persona preset and triggers plan refresh if air context exists.
 * @param {string} id
 * @param {() => void} onRefresh
 */
export function applyPersona(id, onRefresh) {
  const p = PERSONA_PRESETS[id];
  if (!p) return;
  el('children').checked = p.children; el('extra-care').checked = p.extraCare;
  el('commute').value = p.commute; el('budget').value = p.budget; el('home').value = p.home;
  el('usual-hour').value = String(p.usualHour); el('flexibility').value = p.flexibility;
  el('max-shift').value = ''; el('outdoor-hour').value = '16'; el('cooking-hour').value = '19';
  document.querySelectorAll('[data-persona]').forEach(btn => btn.classList.toggle('selected', btn.dataset.persona === id));
  updateProfileSummary();
  safeSave('airwise.profile', profile());
  if (state.air || state.city || state.simulation) onRefresh?.();
  status(`Applied the ${id === 'fixed' ? 'fixed shift' : id} example. Preferences are editable in the household drawer.`);
}
