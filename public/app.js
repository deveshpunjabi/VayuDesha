const el = id => document.getElementById(id);

const API = '/api';
const TABS = ['live', 'plan', 'indoor', 'community'];
const PROFILE_FIELDS = [
  'children', 'extra-care', 'commute', 'budget', 'home',
  'usual-hour', 'flexibility', 'max-shift', 'outdoor-hour', 'cooking-hour'
];
const COMMUTE_LABELS = {
  transit: 'Transit',
  scooter: 'Scooter',
  car: 'Car',
  walk: 'Walk',
  cycle: 'Cycle',
  remote: 'Remote'
};
const FLEX_LABELS = {
  fixed: 'Fixed',
  limited: 'Limited',
  flexible: 'Flexible'
};
const HOME_LABELS = {
  none: '',
  fan: 'Fan',
  purifier: 'Purifier'
};
const CATEGORY_LABELS = {
  outdoor: 'Outdoors',
  home: 'At home',
  travel: 'Travel',
  family: 'Family'
};

const state = {
  view: 'landing',
  activeTab: 'live',
  city: null,
  simulation: false,
  demoScenario: 'unhealthy',
  air: null,
  plan: null,
  routine: null,
  communityBrief: null,
  choices: null,
  community: [],
  pulseCities: [],
  filter: 'all',
  busy: false,
  requestId: 0,
  searchId: 0,
  completed: new Set(),
  aiConfigured: false,
  aiProvider: null,
  eventSource: null,
  streamMode: 'idle',
  lastUpdatedAt: null,
  fallbackPollTimer: null,
  tickerTimer: null,
  lastPlanSignature: null
};

function safeLoad(key) {
  try { return JSON.parse(localStorage.getItem(key)); }
  catch { return null; }
}

function safeSave(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch { /* private browsing may disable storage */ }
}

function profile() {
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

function timezone() {
  return state.city?.timezone || 'Asia/Kolkata';
}

function labelTime(iso, opts = {}) {
  if (!iso) return 'Unknown time';
  try {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: timezone(),
      hour: 'numeric',
      minute: '2-digit',
      ...opts
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toUTCString();
  }
}

function displayNumber(value, digits = 0) {
  return Number.isFinite(value) ? value.toFixed(digits) : '—';
}

function addText(parent, tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = value;
  parent.append(node);
  return node;
}

function makeSvg(tag, attrs, text) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.entries(attrs || {}).forEach(([key, value]) => node.setAttribute(key, String(value)));
  if (text != null) node.textContent = text;
  return node;
}

function status(message) {
  el('status-message').textContent = message;
}

async function api(endpoint, options) {
  const response = await fetch(`${API}${endpoint}`, options);
  let body;
  try { body = await response.json(); }
  catch { throw new Error('Server returned an unreadable response.'); }
  if (!response.ok) throw new Error(body.error || 'Request failed.');
  return body;
}

function post(path, body) {
  return api(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

function requestContext() {
  return {
    simulation: state.simulation,
    demoScenario: state.demoScenario,
    lat: state.city?.latitude,
    lon: state.city?.longitude,
    timezone: timezone(),
    profile: profile()
  };
}

function airSignature(air) {
  if (!air) return '';
  return [
    air.sourceType,
    air.current?.time,
    air.current?.aqi,
    air.current?.pm25,
    air.weather?.windSpeedKmh,
    air.observedStation?.aqi
  ].join('|');
}

function setBusy(value) {
  state.busy = value;
  el('refresh-button').disabled = value || (!state.city && !state.simulation);
  el('send-button').disabled = value;
  el('chat-input').disabled = value;
  el('download-brief').disabled = value || !state.air;
  el('print-brief').disabled = value || !state.air;
  el('scenario-button').disabled = value || !state.air;
  el('download-community').disabled = value || !state.communityBrief;
}

function updateProfileSummary() {
  const p = profile();
  const lead = p.children && p.extraCare
    ? 'Family + Care'
    : p.children
      ? 'Family'
      : p.extraCare
        ? 'Extra care'
        : 'Standard';
  const parts = [
    lead,
    COMMUTE_LABELS[p.commute] || 'Transit',
    FLEX_LABELS[p.flexibility] || 'Limited'
  ];
  const homeTag = HOME_LABELS[p.home];
  if (homeTag) parts.push(homeTag);
  el('profile-summary-pill').textContent = parts.join(' · ');
}

function openProfileDrawer() {
  const drawer = el('profile');
  const backdrop = el('profile-backdrop');
  const trigger = el('open-profile-btn');
  drawer.classList.remove('hidden');
  drawer.classList.add('is-open');
  drawer.setAttribute('aria-hidden', 'false');
  backdrop.classList.remove('hidden');
  backdrop.classList.add('is-open');
  trigger.setAttribute('aria-expanded', 'true');
  el('close-profile-btn').focus();
}

function closeProfileDrawer({ restoreFocus = true } = {}) {
  const drawer = el('profile');
  const backdrop = el('profile-backdrop');
  const trigger = el('open-profile-btn');
  const wasOpen = drawer.classList.contains('is-open');
  drawer.classList.add('hidden');
  drawer.classList.remove('is-open');
  drawer.setAttribute('aria-hidden', 'true');
  backdrop.classList.add('hidden');
  backdrop.classList.remove('is-open');
  trigger.setAttribute('aria-expanded', 'false');
  if (wasOpen && restoreFocus) trigger.focus();
}

function switchTab(tabName, { focusTab = false, updateHash = true } = {}) {
  if (!TABS.includes(tabName)) tabName = 'live';
  state.activeTab = tabName;
  document.querySelectorAll('[data-tab]').forEach(btn => {
    const active = btn.dataset.tab === tabName;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
    btn.setAttribute('tabindex', active ? '0' : '-1');
    if (active && focusTab) btn.focus();
  });
  el('tab-live').classList.toggle('hidden', tabName !== 'live');
  el('tab-plan').classList.toggle('hidden', tabName !== 'plan');
  el('tab-indoor').classList.toggle('hidden', tabName !== 'indoor');
  el('tab-community').classList.toggle('hidden', tabName !== 'community');
  if (updateHash && state.view === 'dashboard') {
    const targetHash = tabName === 'live' ? '#dashboard' : `#${tabName}`;
    if (window.location.hash !== targetHash) {
      try { history.replaceState(null, '', targetHash); } catch { /* ignore */ }
    }
  }
}

function showView(view, tabName = null, { updateHash = true } = {}) {
  const isDashboard = view === 'dashboard';
  state.view = isDashboard ? 'dashboard' : 'landing';
  el('landing-view').classList.toggle('hidden', isDashboard);
  el('dashboard-view').classList.toggle('hidden', !isDashboard);
  el('nav-home-btn').classList.toggle('active', !isDashboard);
  el('nav-dashboard-btn').classList.toggle('active', isDashboard);
  if (isDashboard) {
    el('nav-home-btn').removeAttribute('aria-current');
    el('nav-dashboard-btn').setAttribute('aria-current', 'page');
  } else {
    el('nav-dashboard-btn').removeAttribute('aria-current');
    el('nav-home-btn').setAttribute('aria-current', 'page');
  }
  if (isDashboard) {
    switchTab(tabName || state.activeTab || 'live', { updateHash });
  } else if (updateHash && window.location.hash !== '#overview' && window.location.hash !== '') {
    try { history.replaceState(null, '', '#overview'); } catch { /* ignore */ }
  }
}

async function ensureDashboardLoaded() {
  if (state.city || state.simulation || state.busy) return;
  const savedCity = safeLoad('airwise.city');
  if (savedCity && Number.isFinite(savedCity.latitude) && Number.isFinite(savedCity.longitude) && typeof savedCity.name === 'string') {
    await selectCity(savedCity);
    return;
  }
  const delhiPulse = state.pulseCities.find(c => c.id === 'delhi');
  if (delhiPulse) {
    await selectCity({
      name: delhiPulse.name,
      region: delhiPulse.region,
      country: delhiPulse.country,
      timezone: delhiPulse.timezone,
      latitude: delhiPulse.latitude,
      longitude: delhiPulse.longitude
    });
    return;
  }
  try {
    await searchCity('Delhi', true, 'dashboard');
  } catch (error) {
    status(`${error.message} Choose a city or explore a clearly labelled sample scenario.`);
  }
}

function formatRelativeAge(timestampMs) {
  if (!Number.isFinite(timestampMs)) return 'just now';
  const diffSec = Math.max(0, Math.floor((Date.now() - timestampMs) / 1000));
  if (diffSec < 45) return 'just now';
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

function updateSyncStatus() {
  const dot = document.querySelector('.command-toolbar .live-dot');
  const label = el('live-sync-status');
  if (state.simulation && state.air) {
    if (dot) { dot.className = 'live-dot is-sim'; }
    label.textContent = 'Simulation · Static sample data';
    return;
  }
  if (state.streamMode === 'live' && state.city) {
    if (dot) { dot.className = 'live-dot is-live'; }
    label.textContent = `Live stream · Updated ${formatRelativeAge(state.lastUpdatedAt)}`;
    return;
  }
  if (state.streamMode === 'fallback' && state.city) {
    if (dot) { dot.className = 'live-dot is-live'; }
    label.textContent = `Auto-refresh (5m) · Updated ${formatRelativeAge(state.lastUpdatedAt)}`;
    return;
  }
  if (state.city && state.air) {
    if (dot) { dot.className = 'live-dot is-live'; }
    label.textContent = `Live model · Updated ${formatRelativeAge(state.lastUpdatedAt)}`;
    return;
  }
  if (dot) { dot.className = 'live-dot is-off'; }
  label.textContent = 'Live sync idle';
}

function stopLiveStream() {
  if (state.eventSource) {
    try { state.eventSource.close(); } catch { /* ignore */ }
    state.eventSource = null;
  }
  if (state.fallbackPollTimer) {
    clearInterval(state.fallbackPollTimer);
    state.fallbackPollTimer = null;
  }
  if (!state.simulation) state.streamMode = 'idle';
  updateSyncStatus();
}

function startFallbackPolling() {
  if (state.fallbackPollTimer) return;
  state.streamMode = 'fallback';
  updateSyncStatus();
  state.fallbackPollTimer = setInterval(() => {
    if (!state.simulation && state.city && !state.busy) {
      void refreshPlan({ silent: true });
    }
  }, 5 * 60_000);
}

function startLiveStream(city) {
  stopLiveStream();
  if (!city || state.simulation || typeof EventSource === 'undefined') {
    state.streamMode = state.simulation ? 'sim' : 'idle';
    updateSyncStatus();
    return;
  }
  const url = `${API}/stream?lat=${encodeURIComponent(city.latitude)}&lon=${encodeURIComponent(city.longitude)}`;
  let es;
  try {
    es = new EventSource(url);
  } catch {
    startFallbackPolling();
    return;
  }
  state.eventSource = es;
  let errorCount = 0;

  es.addEventListener('air', event => {
    if (es !== state.eventSource || state.simulation) return;
    errorCount = 0;
    let payload;
    try { payload = JSON.parse(event.data); } catch { return; }
    if (!payload?.air) return;
    state.lastUpdatedAt = Date.now();
    state.streamMode = 'live';
    const nextSig = airSignature(payload.air);
    const prevSig = state.lastPlanSignature;
    state.air = payload.air;
    render();
    updateSyncStatus();
    if (prevSig && nextSig !== prevSig && !state.busy) {
      void refreshPlan({ silent: true });
    }
  });

  es.addEventListener('error', event => {
    if (es !== state.eventSource || state.simulation) return;
    if (typeof event.data === 'string' && event.data.length > 0) {
      el('live-sync-status').textContent = 'Live stream · Provider update delayed';
      return;
    }
    errorCount++;
    if (es.readyState === EventSource.CLOSED || errorCount >= 2) {
      try { es.close(); } catch { /* ignore */ }
      if (state.eventSource === es) state.eventSource = null;
      startFallbackPolling();
    }
  });
}

function startFreshnessTicker() {
  if (state.tickerTimer) clearInterval(state.tickerTimer);
  state.tickerTimer = setInterval(updateSyncStatus, 30_000);
}

async function loadPulse() {
  const grid = el('pulse-grid');
  const updated = el('pulse-updated');
  const pulseDot = document.querySelector('.pulse-meta .live-dot');
  try {
    const data = await api('/pulse');
    const cities = Array.isArray(data.cities) ? data.cities : [];
    state.pulseCities = cities;
    grid.replaceChildren();
    if (!cities.length) {
      addText(grid, 'div', 'empty-state', 'Live city pulse is temporarily unavailable. Use city search or load a sample scenario.');
      updated.textContent = 'Live pulse unavailable';
      if (pulseDot) pulseDot.className = 'live-dot is-off';
      return;
    }
    cities.forEach(city => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'pulse-card';
      card.dataset.tone = city.tone || 'unknown';
      card.setAttribute('aria-label', `Inspect ${city.name}: US AQI ${displayNumber(city.aqi)}, ${city.category || 'Unavailable'}`);

      const head = addText(card, 'div', 'pulse-card-head', '');
      const titleWrap = document.createElement('div');
      addText(titleWrap, 'span', 'pulse-city', city.name);
      addText(titleWrap, 'span', 'pulse-region', [city.region, city.country].filter(Boolean).join(', '));
      head.append(titleWrap);
      addText(head, 'span', 'pill pill-neutral', 'CAMS MODEL');

      const aqiRow = addText(card, 'div', 'pulse-aqi-row', '');
      addText(aqiRow, 'span', 'pulse-aqi', displayNumber(city.aqi));
      addText(aqiRow, 'span', 'pulse-unit', 'US AQI');

      addText(card, 'span', 'pulse-badge', city.category || 'Unavailable');

      const metrics = addText(card, 'div', 'pulse-metrics', '');
      const pmMetric = addText(metrics, 'div', 'pulse-metric', '');
      addText(pmMetric, 'span', '', 'PM2.5');
      addText(pmMetric, 'strong', '', Number.isFinite(city.pm25) ? `${city.pm25.toFixed(1)} µg/m³` : '—');

      const windMetric = addText(metrics, 'div', 'pulse-metric', '');
      addText(windMetric, 'span', '', 'Wind');
      addText(windMetric, 'strong', '', Number.isFinite(city.windSpeed) ? `${city.windSpeed.toFixed(1)} km/h` : '—');

      const foot = addText(card, 'div', 'pulse-foot', '');
      const footNote = city.error
        ? city.error
        : city.time
          ? `Model ${labelTime(city.time, { timeZone: city.timezone || 'Asia/Kolkata' })}`
          : 'Open-Meteo CAMS';
      addText(foot, 'span', '', footNote);
      addText(foot, 'span', 'pulse-cta', 'Inspect →');

      card.addEventListener('click', () => {
        showView('dashboard', 'live');
        window.scrollTo({ top: 0, behavior: 'auto' });
        void selectCity({
          name: city.name,
          region: city.region,
          country: city.country,
          timezone: city.timezone || 'Asia/Kolkata',
          latitude: city.latitude,
          longitude: city.longitude
        });
      });

      grid.append(card);
    });

    const anyAvailable = cities.some(c => Number.isFinite(c.aqi));
    if (pulseDot) pulseDot.className = anyAvailable ? 'live-dot is-live' : 'live-dot is-off';
    updated.textContent = anyAvailable
      ? `Updated ${labelTime(data.retrievedAt, { timeZone: 'Asia/Kolkata' })} IST · Open-Meteo / CAMS`
      : 'Live Open-Meteo pulse unreachable · Try a sample scenario';
  } catch {
    grid.replaceChildren();
    addText(grid, 'div', 'empty-state', 'Live multi-city pulse could not reach Open-Meteo right now. Search a city or load a synthetic sample scenario above.');
    updated.textContent = 'Live pulse unavailable';
    if (pulseDot) pulseDot.className = 'live-dot is-off';
  }
}

async function searchCity(query, chooseAutomatically = false, origin = 'dashboard') {
  const searchId = ++state.searchId;
  const resultsEl = origin === 'landing' ? el('landing-city-results') : el('city-results');
  resultsEl.replaceChildren();
  status('Searching for matching cities…');
  if (origin === 'landing') {
    addText(resultsEl, 'span', 'small muted', 'Searching matching cities…');
  }
  const { results } = await api(`/cities?q=${encodeURIComponent(query.trim())}`);
  if (searchId !== state.searchId) return;
  resultsEl.replaceChildren();
  if (!results.length) {
    const msg = 'No matching cities found. Try adding a country.';
    status(msg);
    if (origin === 'landing') addText(resultsEl, 'span', 'small muted', msg);
    return;
  }
  if (chooseAutomatically) {
    const picked = results.find(r => r.country.toLowerCase() === 'india') || results[0];
    await selectCity(picked);
    return;
  }
  status(`Found ${results.length} matching locations. Select the correct one.`);
  results.forEach(city => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'city-option';
    button.textContent = [city.name, city.region, city.country].filter(Boolean).join(', ');
    button.addEventListener('click', () => {
      if (state.view !== 'dashboard') {
        showView('dashboard', 'live');
        window.scrollTo({ top: 0, behavior: 'auto' });
      }
      void selectCity(city);
    });
    resultsEl.append(button);
  });
}

async function selectCity(city) {
  state.searchId++;
  stopLiveStream();
  state.city = city;
  state.simulation = false;
  state.air = null;
  state.plan = null;
  state.routine = null;
  state.communityBrief = null;
  state.choices = null;
  state.community = [];
  state.lastPlanSignature = null;
  state.lastUpdatedAt = null;
  el('scenario-result').textContent = 'Reload the plan to compare this location and household context.';
  el('city-results').replaceChildren();
  el('landing-city-results').replaceChildren();
  const label = [city.name, city.country].filter(Boolean).join(', ');
  el('city-input').value = label;
  el('landing-city-input').value = label;
  render();
  safeSave('airwise.city', city);
  await refreshPlan();
  if (!state.simulation && state.city === city && state.air) {
    startLiveStream(city);
  }
}

async function loadSimulation(scenarioOverride = null) {
  state.searchId++;
  stopLiveStream();
  const scenario = scenarioOverride || el('demo-scenario').value;
  el('demo-scenario').value = scenario;
  el('landing-demo-scenario').value = scenario;
  state.city = null;
  state.simulation = true;
  state.demoScenario = scenario;
  state.streamMode = 'sim';
  state.air = null;
  state.plan = null;
  state.routine = null;
  state.communityBrief = null;
  state.choices = null;
  state.community = [];
  state.lastPlanSignature = null;
  state.lastUpdatedAt = null;
  el('scenario-result').textContent = 'Reload the plan to compare this location and household context.';
  el('city-input').value = `Sample: ${state.demoScenario} (not live)`;
  el('city-results').replaceChildren();
  el('landing-city-results').replaceChildren();
  render();
  await refreshPlan();
}

async function refreshPlan({ silent = false } = {}) {
  const requestId = ++state.requestId;
  if (!silent) {
    el('dashboard-view').classList.add('is-loading');
    el('scenario-result').textContent = 'Load complete. Select a comparison to see which recommendation rules change.';
    setBusy(true);
    status('Updating your air-quality plan…');
  }
  try {
    const data = await post('/plan', requestContext());
    if (requestId !== state.requestId) return;
    state.air = data.air;
    state.plan = data.plan;
    state.routine = data.routine;
    state.communityBrief = data.communityBrief;
    state.choices = data.choices;
    state.community = data.community || [];
    state.lastPlanSignature = airSignature(data.air);
    state.lastUpdatedAt = Date.now();
    restoreCompleted();
    render();
    updateSyncStatus();
    if (!silent) {
      status(state.simulation
        ? 'Viewing clearly labelled sample data. Change to a real city for live model forecasts.'
        : 'Loaded regional, modelled data. Check the source and timestamp before acting.');
    }
  } catch (error) {
    if (requestId !== state.requestId) return;
    if (!silent) {
      state.air = null;
      state.plan = null;
      state.routine = null;
      state.communityBrief = null;
      state.choices = null;
      state.community = [];
      state.lastPlanSignature = null;
      el('scenario-result').textContent = 'Reload the plan to compare this location and household context.';
      render();
      updateSyncStatus();
      status(`${error.message} Try another city, retry, or explore the sample scenario.`);
    }
  } finally {
    if (!silent && requestId === state.requestId) {
      el('dashboard-view').classList.remove('is-loading');
      setBusy(false);
    }
  }
}

function categoryText(level) {
  if (level < 0) return 'No usable AQI available.';
  if (level >= 4) return 'Pollution is elevated. Consider reducing optional outdoor exertion.';
  if (level >= 2) return 'Outdoor conditions may affect your usual daily routine.';
  return 'Check air conditions when planning outdoor activity.';
}

function renderObservedStation(obs) {
  const card = el('observed-station-card');
  if (!obs || !Number.isFinite(obs.aqi)) {
    card.classList.add('hidden');
    return;
  }
  card.classList.remove('hidden');
  el('observed-station-name').textContent = obs.stationName || 'Ground monitoring station';
  el('observed-station-aqi').textContent = displayNumber(obs.aqi);
  const meta = el('observed-station-meta');
  meta.replaceChildren();
  const parts = [
    obs.source || 'Observed ground station',
    obs.dominantPollutant ? `Dominant: ${obs.dominantPollutant.toUpperCase()}` : null,
    obs.time ? `Reported: ${labelTime(obs.time, { day: 'numeric', month: 'short' })}` : null
  ].filter(Boolean);
  meta.append(document.createTextNode(`${parts.join(' · ')} — independent observed comparison alongside CAMS model.`));
  if (typeof obs.url === 'string' && /^https?:\/\//i.test(obs.url)) {
    meta.append(document.createTextNode(' '));
    const link = document.createElement('a');
    link.href = obs.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Station source';
    meta.append(link);
  }
}

function renderWeather(air) {
  const w = air?.weather || null;
  el('weather-wind').textContent = Number.isFinite(w?.windSpeedKmh) ? `${w.windSpeedKmh.toFixed(1)} km/h` : '—';
  el('weather-humidity').textContent = Number.isFinite(w?.humidityPct) ? `${Math.round(w.humidityPct)}%` : '—';
  el('weather-temp').textContent = Number.isFinite(w?.temperatureC) ? `${w.temperatureC.toFixed(1)} °C` : '—';
  el('weather-pressure').textContent = Number.isFinite(w?.pressureHpa) ? `${Math.round(w.pressureHpa)} hPa` : '—';
  el('weather-dispersion').textContent = w?.dispersionNote
    || (air
      ? 'Surface meteorology is temporarily unavailable for this snapshot.'
      : 'Load a live city or sample scenario to view wind dispersion conditions.');
}

function aqiToScalePercent(aqi) {
  const bands = [
    [0, 50, 0, 100 / 6],
    [50, 100, 100 / 6, 200 / 6],
    [100, 150, 200 / 6, 300 / 6],
    [150, 200, 300 / 6, 400 / 6],
    [200, 300, 400 / 6, 500 / 6],
    [300, 500, 500 / 6, 100]
  ];
  const clamped = Math.max(0, Math.min(500, aqi));
  for (const [lo, hi, pLo, pHi] of bands) {
    if (clamped <= hi) {
      const ratio = hi === lo ? 0 : (clamped - lo) / (hi - lo);
      return Math.max(1.5, Math.min(98.5, pLo + ratio * (pHi - pLo)));
    }
  }
  return 98.5;
}

function renderScaleMarker(aqi) {
  const marker = el('aqi-scale-marker');
  if (!Number.isFinite(aqi)) {
    marker.classList.add('hidden');
    return;
  }
  const pct = aqiToScalePercent(aqi);
  marker.classList.remove('hidden');
  marker.style.left = `${pct.toFixed(1)}%`;
}

function render() {
  const air = state.air;
  const plan = state.plan;
  el('air-hero').dataset.tone = plan?.category?.tone || 'unknown';
  el('simulation-banner').classList.toggle('hidden', !state.simulation || !air);

  const locationTitle = state.simulation
    ? 'Sample city · simulation'
    : state.city
      ? `${state.city.name}, ${state.city.country}`
      : 'Choose your city';
  el('air-title').textContent = locationTitle;
  el('header-location').textContent = state.simulation
    ? `Sample (${state.demoScenario})`
    : state.city
      ? `${state.city.name}, ${state.city.country}`
      : 'No city selected';

  el('aqi-number').textContent = displayNumber(air?.current?.aqi);
  el('aqi-category').textContent = plan?.category?.name || 'Not available';
  renderScaleMarker(air?.current?.aqi);

  el('pm25-number').textContent = displayNumber(air?.current?.pm25, 1);
  el('pm10-number').textContent = displayNumber(air?.current?.pm10, 1);
  el('no2-number').textContent = displayNumber(air?.current?.no2, 1);
  el('o3-number').textContent = displayNumber(air?.current?.o3, 1);
  el('so2-number').textContent = displayNumber(air?.current?.so2, 1);
  el('co-number').textContent = displayNumber(air?.current?.co, 0);

  const barSpecs = [
    ['pm25-bar', air?.current?.pm25, 150, 35, 75],
    ['pm10-bar', air?.current?.pm10, 250, 50, 150],
    ['no2-bar', air?.current?.no2, 200, 40, 100],
    ['o3-bar', air?.current?.o3, 180, 60, 120],
    ['so2-bar', air?.current?.so2, 150, 20, 80],
    ['co-bar', air?.current?.co, 6000, 1500, 4000]
  ];
  for (const [id, val, max, mid, high] of barSpecs) {
    const bar = el(id);
    if (!bar) continue;
    if (!Number.isFinite(val)) {
      bar.style.width = '0%';
      bar.style.background = '#9CA3AF';
    } else {
      const pct = Math.max(6, Math.min(100, (val / max) * 100));
      bar.style.width = `${pct.toFixed(0)}%`;
      bar.style.background = val >= high ? '#DC2626' : val >= mid ? '#D97706' : '#059669';
    }
  }

  renderWeather(air);
  renderObservedStation(air?.observedStation || null);

  el('air-description').textContent = plan
    ? categoryText(plan.category.level)
    : 'Understand your local forecast before changing your plans.';
  el('air-timestamp').textContent = air
    ? `Model timestamp: ${labelTime(air.current.time, { day: 'numeric', month: 'short' })} · ${timezone()}`
    : 'No current model data loaded';
  el('data-source-badge').textContent = state.simulation && air
    ? 'SAMPLE ONLY'
    : air
      ? 'CAMS MODEL'
      : 'AWAITING DATA';
  el('model-mode').textContent = air
    ? (state.simulation ? 'Sample scenario' : 'CAMS model forecast')
    : 'Ready to load air data';
  el('outlook-headline').textContent = plan?.headline
    || 'Your personalized outlook will appear here once a location is selected.';
  el('source-disclosure').textContent = air?.disclosure
    || 'This app uses Open-Meteo / Copernicus CAMS regional model data in live mode, reported on the US AQI scale—not official CPCB Indian National AQI.';

  const best = plan?.window;
  el('best-time').textContent = !air
    ? 'Waiting for forecast'
    : best
      ? labelTime(best.time, { weekday: 'short' })
      : plan?.profile?.flexibility === 'fixed'
        ? 'Fixed schedule — no shift'
        : (plan?.profile?.maxShiftMinutes ?? 15) < 60
          ? 'Sub-hour shift — keep routine'
          : 'No lower forecast hour';
  el('best-time-caption').textContent = best
    ? `Predicted U.S. AQI ${displayNumber(best.predictedAqi)} within your schedule. Lower modelled PM2.5, not guaranteed safe.`
    : plan?.timingNotice || 'No feasible forecast comparison available.';

  renderChart(air?.forecast || []);
  renderComparison(plan?.comparison);
  renderActions(plan?.recommendations || []);
  renderChecklist(plan?.recommendations || []);
  renderRoutine(state.routine);
  renderChoices(state.choices);
  renderCommunity(state.community);

  el('brief-status').textContent = air
    ? (state.simulation ? 'PERSONAL BRIEF · SYNTHETIC DEMO' : 'PERSONAL BRIEF · REGIONAL MODEL DATA')
    : 'PERSONAL BRIEF · WAITING FOR A CITY';
  updateSyncStatus();
}

function renderChart(forecast) {
  const chart = el('forecast-chart');
  const tooltip = el('forecast-tooltip');
  chart.replaceChildren();
  const points = forecast
    .filter(p => p.time && Number.isFinite(p.aqi) && Date.parse(p.time) < Date.now() + 24 * 3600_000)
    .slice(0, 24);

  if (!points.length) {
    chart.append(makeSvg('text', { x: 28, y: 112, fill: '#64748B', 'font-size': 16 }, 'No forecast data available'));
    el('forecast-hours').replaceChildren();
    el('forecast-text').textContent = 'No usable hourly forecast available.';
    tooltip.textContent = 'No hourly points available';
    return;
  }

  const width = 920;
  const height = 220;
  const left = 44;
  const right = 22;
  const top = 18;
  const bottom = 26;
  const minVal = Math.max(0, Math.floor((Math.min(...points.map(p => p.aqi)) - 25) / 25) * 25);
  const maxVal = Math.max(minVal + 25, Math.ceil((Math.max(...points.map(p => p.aqi)) + 25) / 25) * 25);
  const x = i => left + i * (width - left - right) / Math.max(1, points.length - 1);
  const y = value => top + (maxVal - value) * (height - top - bottom) / (maxVal - minVal);

  for (let i = 0; i < 4; i++) {
    const tick = minVal + (maxVal - minVal) * i / 3;
    const yy = y(tick);
    chart.append(makeSvg('line', {
      x1: left,
      x2: width - right,
      y1: yy.toFixed(1),
      y2: yy.toFixed(1),
      stroke: '#E2E8F0',
      'stroke-width': 1,
      'stroke-dasharray': i === 0 ? 'none' : '4 6'
    }));
    chart.append(makeSvg('text', {
      x: 4,
      y: (yy + 4).toFixed(1),
      fill: '#64748B',
      'font-size': 11,
      'font-family': 'ui-monospace, Consolas, monospace'
    }, String(Math.round(tick))));
  }

  const coords = points.map((p, i) => [x(i), y(p.aqi)]);
  const line = coords.map(([xx, yy], i) => `${i ? 'L' : 'M'} ${xx.toFixed(1)} ${yy.toFixed(1)}`).join(' ');
  const baseY = height - bottom;

  const defs = makeSvg('defs');
  const gradient = makeSvg('linearGradient', { id: 'chart-gradient', x1: '0%', y1: '0%', x2: '0%', y2: '100%' });
  gradient.append(makeSvg('stop', { offset: '0%', 'stop-color': '#111827', 'stop-opacity': '0.14' }));
  gradient.append(makeSvg('stop', { offset: '100%', 'stop-color': '#111827', 'stop-opacity': '0.01' }));
  defs.append(gradient);
  chart.append(defs);

  chart.append(makeSvg('path', {
    d: `${line} L ${x(points.length - 1).toFixed(1)} ${baseY} L ${x(0).toFixed(1)} ${baseY} Z`,
    fill: 'url(#chart-gradient)'
  }));
  chart.append(makeSvg('path', {
    d: line,
    fill: 'none',
    stroke: '#111827',
    'stroke-width': 2.5,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round'
  }));

  const lowest = Math.min(...points.map(p => p.aqi));
  const highest = Math.max(...points.map(p => p.aqi));
  const lowIndex = points.findIndex(p => p.aqi === lowest);

  const formatPointTooltip = (point, prefix = '') => {
    const timeStr = labelTime(point.time, { weekday: 'short' });
    const pmStr = Number.isFinite(point.pm25) ? ` · PM2.5 ${point.pm25.toFixed(1)} µg/m³` : '';
    return `${prefix}${timeStr} · US AQI ${Math.round(point.aqi)}${pmStr}`;
  };

  const defaultTooltip = formatPointTooltip(points[lowIndex], 'Lowest modelled: ');
  tooltip.textContent = defaultTooltip;

  points.forEach((point, i) => {
    const isLowest = i === lowIndex;
    const cx = x(i).toFixed(1);
    const cy = y(point.aqi).toFixed(1);
    const label = formatPointTooltip(point);
    const circle = makeSvg('circle', {
      cx,
      cy,
      r: isLowest ? 6 : 4,
      fill: isLowest ? '#2563EB' : '#FFFFFF',
      stroke: '#2563EB',
      'stroke-width': isLowest ? 3 : 2,
      class: 'chart-point',
      tabindex: '0',
      role: 'button',
      'aria-label': label
    });
    circle.append(makeSvg('title', {}, label));
    const highlight = () => {
      circle.setAttribute('r', '7');
      tooltip.textContent = label;
    };
    const reset = () => {
      circle.setAttribute('r', isLowest ? '6' : '4');
      tooltip.textContent = defaultTooltip;
    };
    circle.addEventListener('pointerenter', highlight);
    circle.addEventListener('focus', highlight);
    circle.addEventListener('click', highlight);
    circle.addEventListener('pointerleave', reset);
    circle.addEventListener('blur', reset);
    chart.append(circle);
  });

  el('forecast-hours').replaceChildren();
  const tickIndices = [...new Set([0, Math.floor((points.length - 1) / 3), Math.floor(((points.length - 1) * 2) / 3), points.length - 1])];
  for (const idx of tickIndices) {
    const label = document.createElement('span');
    label.textContent = labelTime(points[idx].time, { weekday: 'short' });
    el('forecast-hours').append(label);
  }
  el('forecast-text').textContent = `Modelled U.S. AQI ranges from ${Math.round(lowest)} to ${Math.round(highest)} in the visible 24-hour forecast. Actual neighborhood conditions may differ.`;
}

function renderComparison(comparison) {
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

function renderActions(actions) {
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
    link.href = r.source;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Official guidance';
    evidence.append(link);
    container.append(card);
  });
}

function completionKey() {
  const location = state.simulation
    ? 'synthetic'
    : state.city
      ? `${state.city.name}:${state.city.country}`
      : 'unselected';
  // Completion records are not health outcomes and remain in this browser.
  return `airwise.checklist.${location}.${new Date().toISOString().slice(0, 10)}`;
}

function restoreCompleted() {
  const saved = safeLoad(completionKey());
  state.completed = new Set(Array.isArray(saved) ? saved.filter(x => typeof x === 'string').slice(0, 20) : []);
}

function renderChecklist(recs) {
  const root = el('brief-checklist');
  root.replaceChildren();
  const featured = recs
    .slice()
    .sort((a, b) => ({ urgent: 0, high: 1, normal: 2 }[a.priority] ?? 3) - ({ urgent: 0, high: 1, normal: 2 }[b.priority] ?? 3))
    .slice(0, 3);

  if (!featured.length) {
    addText(root, 'div', 'empty-state', 'Your three most useful actions appear here after a scenario loads.');
    el('brief-progress').textContent = '0 of 3 considered';
    return;
  }
  const count = featured.filter(r => state.completed.has(r.id)).length;
  el('brief-progress').textContent = `${count} of ${featured.length} considered`;
  featured.forEach((item, index) => {
    const row = document.createElement('label');
    row.className = 'brief-task';
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = state.completed.has(item.id);
    check.setAttribute('aria-label', `Mark action ${index + 1} as considered: ${item.title}`);
    check.addEventListener('change', () => {
      if (check.checked) state.completed.add(item.id);
      else state.completed.delete(item.id);
      safeSave(completionKey(), [...state.completed]);
      el('brief-progress').textContent = `${featured.filter(r => state.completed.has(r.id)).length} of ${featured.length} considered`;
    });
    row.append(check);
    const words = document.createElement('div');
    addText(words, 'strong', '', item.title);
    addText(words, 'span', '', item.action);
    row.append(words);
    root.append(row);
  });
}

function renderRoutine(routine) {
  const root = el('routine-timeline');
  root.replaceChildren();
  el('routine-source').textContent = routine
    ? `${routine.dataProvenance.index} · ${routine.dataProvenance.sourceType === 'simulation' ? 'SAMPLE' : 'MODEL'}`
    : 'Waiting for air data';
  el('routine-notice').textContent = routine
    ? `${state.plan?.timingNotice || ''} Timing is a recurring daily template; verify conditions before each activity.`
    : 'Choose a city or sample scenario to build your day.';

  if (!Array.isArray(routine?.items) || routine.items.length === 0) {
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
    if (step.impactValueOrNull != null) {
      addText(content, 'p', 'routine-impact', `Modelled outdoor comparison: ${step.impactValueOrNull} ${step.unitOrNull}. Not measured personal exposure.`);
    }
    const details = addText(content, 'p', 'routine-details', `Impact: ${step.impactCategory.replaceAll('-', ' ')} · Cost: ${step.costBand} · ${step.confidence}`);
    if (step.evidenceIds?.[0]) {
      const link = document.createElement('a');
      link.href = step.evidenceIds[0];
      link.rel = 'noopener noreferrer';
      link.target = '_blank';
      link.textContent = 'Evidence';
      details.append(' · ', link);
    }
  }
}

function downloadTextFile(filename, content) {
  if (!content) return;
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

function downloadCommunity() {
  const brief = state.communityBrief;
  if (!brief) return;
  const lines = [
    'VAYUDESHA · COMMUNITY AIR BRIEF',
    `Date: ${brief.date} · ${brief.timezone}`,
    `Source: ${brief.source} | Type: ${brief.sourceType} | Index: ${brief.index}`,
    `Model timestamp: ${brief.modelTimestamp ?? 'Unavailable'}`,
    `AQI: ${brief.value ?? 'Unavailable'} · ${brief.category}`,
    ...(brief.simulated ? ['DEMO ONLY — SYNTHETIC DATA. NOT CURRENT CONDITIONS.'] : []),
    '',
    ...brief.actions.map((x, i) => `${i + 1}. ${x.title}\n${x.action}\nEvidence: ${x.evidenceUrl}`),
    '',
    brief.disclaimer
  ];
  downloadTextFile('vayudesha-community-brief.txt', lines.join('\n'));
}

function renderChoices(data) {
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
    addText(card, 'p', 'choice-caveat', `Limit: ${item.limitation}`);
    const evidence = addText(card, 'p', 'choice-evidence', '');
    const link = document.createElement('a');
    link.href = item.source;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Check source guidance';
    evidence.append(link);
    root.append(card);
  }
}

function renderCommunity(actions) {
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
    link.href = item.source;
    link.rel = 'noopener noreferrer';
    link.target = '_blank';
    link.textContent = 'Evidence & context';
    card.append(link);
    root.append(card);
  }
}

function textBrief() {
  if (!state.air || !state.plan) return '';
  const c = state.air.current || {};
  const w = state.air.weather;
  const lines = [
    'VAYUDESHA · PERSONAL DAILY AIR BRIEF',
    `Place: ${state.simulation ? 'SAMPLE SIMULATION (NOT LIVE)' : [state.city?.name, state.city?.country].filter(Boolean).join(', ')}`,
    `Data: ${state.air.source} | Type: ${state.air.sourceType} | Index: ${state.air.index}`,
    `Model time: ${c.time} | Retrieved: ${state.air.retrievedAt}`,
    `US AQI: ${c.aqi ?? 'Unavailable'} | PM2.5 (µg/m³): ${c.pm25 ?? 'Unavailable'} | PM10 (µg/m³): ${c.pm10 ?? 'Unavailable'}`,
    `Trace gases (µg/m³): NO2 ${c.no2 ?? '—'} | O3 ${c.o3 ?? '—'} | SO2 ${c.so2 ?? '—'} | CO ${c.co ?? '—'}`,
    ...(w ? [`Meteorology (${w.source}): Wind ${w.windSpeedKmh ?? '—'} km/h | Humidity ${w.humidityPct ?? '—'}% | Temp ${w.temperatureC ?? '—'} °C | ${w.dispersionNote}`] : []),
    `Status: ${state.plan.category.name}`,
    `Summary: ${state.plan.headline}`,
    '',
    'MY CLEAN-AIR DAY (APPROXIMATE ROUTINE TEMPLATE)',
    ...((state.routine?.items || []).map((x, i) => `${i + 1}. ${x.approximateTime} ${x.activity}: ${x.action} [${x.impactCategory}]. Evidence: ${x.evidenceIds.join(', ')}`)),
    `Timing limitations: ${state.plan.timingNotice}`,
    '',
    'YOUR ACTION PLAN',
    ...state.plan.recommendations.map((r, i) => `${i + 1}. ${r.title}\nAction: ${r.action}\nWhy: ${r.why}\nLikely impact: ${r.impact}\nSource: ${r.source}\n`),
    '',
    'TRADE-OFFS',
    ...((state.choices?.choices || []).map(ch => `${ch.title}: Exposure: ${ch.exposure}; Emissions: ${ch.emissions}; Cost: ${ch.cost}. ${ch.limitation}`)),
    '',
    'LIMITATIONS',
    state.air.disclosure,
    ...state.plan.disclaimers,
    'This report is informational, does not assess personal medical needs, and does not measure your indoor air or personal exposure.'
  ];
  return lines.join('\n');
}

function downloadBrief() {
  downloadTextFile('vayudesha-daily-brief.txt', textBrief());
}

function applyPersona(id) {
  const personas = {
    family: { children: true, extraCare: false, commute: 'scooter', budget: 'low', home: 'none', usualHour: 8, flexibility: 'limited' },
    cyclist: { children: false, extraCare: false, commute: 'cycle', budget: 'free', home: 'none', usualHour: 9, flexibility: 'flexible' },
    fixed: { children: false, extraCare: true, commute: 'transit', budget: 'free', home: 'fan', usualHour: 7, flexibility: 'fixed' },
    budget: { children: true, extraCare: false, commute: 'walk', budget: 'free', home: 'none', usualHour: 8, flexibility: 'fixed' }
  };
  const p = personas[id];
  if (!p) return;
  el('children').checked = p.children;
  el('extra-care').checked = p.extraCare;
  el('commute').value = p.commute;
  el('budget').value = p.budget;
  el('home').value = p.home;
  el('usual-hour').value = String(p.usualHour);
  el('flexibility').value = p.flexibility;
  el('max-shift').value = '';
  el('outdoor-hour').value = '16';
  el('cooking-hour').value = '19';
  document.querySelectorAll('[data-persona]').forEach(button => {
    button.classList.toggle('selected', button.dataset.persona === id);
  });
  updateProfileSummary();
  safeSave('airwise.profile', profile());
  if (state.air || state.city || state.simulation) void refreshPlan();
  status(`Applied the ${id === 'fixed' ? 'fixed shift' : id} example. Preferences are editable in the household drawer.`);
}

function showComparison(result) {
  const root = el('scenario-result');
  root.replaceChildren();
  addText(root, 'h3', '', result.alternativeLabel);
  if (!result.changedFields?.length) {
    addText(root, 'p', '', 'No household preferences changed. The recommendation engine correctly kept the plan unchanged.');
    return;
  }
  addText(root, 'p', '', `Compared under exactly the same ${result.sourceType === 'simulation' ? 'synthetic' : 'modelled'} outdoor conditions. Changed fields: ${result.changedFields.join(', ')}.`);
  const grid = addText(root, 'div', 'proof-changes', '');
  const original = addText(grid, 'div', 'proof-tile', '');
  addText(original, 'strong', '', 'Before · Your current settings');
  addText(original, 'p', '', `Household actions: ${result.before.actions.length}`);
  addText(original, 'small', '', result.before.bestWindow ? 'Flexible timing advice available where forecast permits.' : 'No alternate-time guidance available.');
  const alternative = addText(grid, 'div', 'proof-tile', '');
  addText(alternative, 'strong', '', 'After · New circumstances');
  addText(alternative, 'p', '', `Household actions: ${result.after.actions.length}`);
  addText(alternative, 'small', '', result.after.bestWindow ? 'Flexible timing advice available where forecast permits.' : 'No alternate-time guidance available.');
  const delta = result.changes;
  const changes = [
    ...delta.added.map(a => `Added: ${a.title} — ${a.action}`),
    ...delta.removed.map(a => `Removed: ${a.title}`),
    ...delta.modified.map(a => `Adapted: ${a.title} — ${a.action}`),
    ...(delta.scheduleChanged ? ['Time advice changed because schedule constraints changed.'] : [])
  ];
  if (!changes.length) {
    addText(root, 'p', '', 'The tested advice remained the same under this one-field change. This is a valid result.');
  } else {
    changes.slice(0, 6).forEach(message => addText(root, 'p', 'proof-item', message));
  }
  addText(root, 'p', 'small muted', result.caveat);
}

function appendChat(message, role) {
  const node = document.createElement('div');
  node.className = `chat-bubble ${role === 'user' ? 'user-bubble' : 'assistant-bubble'}`;
  node.textContent = message;
  el('chat-log').append(node);
  el('chat-log').scrollTop = el('chat-log').scrollHeight;
}

function formatAiBadge(response) {
  if (response.mode === 'genai') {
    const providerTag = response.provider === 'gemini'
      ? ' · GEMINI'
      : response.provider === 'openai'
        ? ' · OPENAI'
        : '';
    return `GENAI-SELECTED · EVIDENCE-LOCKED${providerTag}`;
  }
  if (response.mode === 'fallback') return 'RULES FALLBACK · AI UNAVAILABLE';
  return state.aiConfigured
    ? 'VERIFIED RULES · SAFETY BOUNDARY'
    : 'RULE-BASED ASSISTANT · AI NOT CONFIGURED';
}

async function sendChat(event) {
  event.preventDefault();
  if (state.busy) return;
  const question = el('chat-input').value.trim();
  if (question.length < 2 || question.length > 550) return;
  el('chat-input').value = '';
  appendChat(question, 'user');
  const thinking = document.createElement('div');
  thinking.className = 'chat-bubble assistant-bubble chat-thinking';
  const dots = document.createElement('span');
  dots.className = 'thinking-dots';
  dots.append(document.createElement('span'), document.createElement('span'), document.createElement('span'));
  const label = document.createElement('span');
  label.textContent = 'Checking verified guidance...';
  thinking.append(dots, label);
  el('chat-log').append(thinking);
  el('chat-log').scrollTop = el('chat-log').scrollHeight;
  const contextId = state.requestId;
  setBusy(true);
  try {
    const response = await post('/chat', { ...requestContext(), question });
    thinking.remove();
    if (contextId !== state.requestId) return;
    appendChat(response.reply, 'assistant');
    el('ai-mode').textContent = formatAiBadge(response);
  } catch (error) {
    thinking.remove();
    if (contextId === state.requestId) {
      const hint = !state.city && !state.simulation
        ? ' Select a city or load a labelled sample scenario for location-based advice.'
        : '';
      appendChat(`Unable to answer right now: ${error.message}${hint}`, 'assistant');
    }
  } finally {
    if (contextId === state.requestId) setBusy(false);
    el('chat-input').focus();
  }
}

async function runRoomPlan() {
  el('room-plan-result').replaceChildren();
  try {
    const { roomPlan } = await post('/room-plan', {
      area: el('room-area').value,
      home: el('home').value,
      budget: el('budget').value,
      source: el('room-source').value
    });
    el('cadr-result').textContent = `Suggested smoke CADR: ${roomPlan.smokeCadrEstimate.value} ${roomPlan.smokeCadrEstimate.unit}. ${roomPlan.smokeCadrEstimate.assumption}`;
    const root = el('room-plan-result');
    for (const action of roomPlan.actions) {
      const row = addText(root, 'div', 'room-action', '');
      addText(row, 'strong', '', action.title);
      addText(row, 'p', '', action.advice);
      const link = document.createElement('a');
      link.href = action.source;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'Read source';
      row.append(link);
    }
    addText(root, 'p', 'small muted', roomPlan.limitations.join(' '));
  } catch (error) {
    el('cadr-result').textContent = error.message;
  }
}

function resetProfileDefaults() {
  el('children').checked = false;
  el('extra-care').checked = false;
  el('commute').value = 'transit';
  el('budget').value = 'free';
  el('home').value = 'none';
  el('usual-hour').value = '8';
  el('flexibility').value = 'limited';
  el('max-shift').value = '';
  el('outdoor-hour').value = '16';
  el('cooking-hour').value = '19';
  document.querySelectorAll('[data-persona]').forEach(b => b.classList.remove('selected'));
  updateProfileSummary();
}

function installHandlers() {
  el('brand-home-link').addEventListener('click', event => {
    event.preventDefault();
    closeProfileDrawer({ restoreFocus: false });
    showView('landing');
    window.scrollTo({ top: 0, behavior: 'auto' });
  });

  el('nav-home-btn').addEventListener('click', () => {
    closeProfileDrawer({ restoreFocus: false });
    showView('landing');
    window.scrollTo({ top: 0, behavior: 'auto' });
  });

  const openDashboard = () => {
    closeProfileDrawer({ restoreFocus: false });
    showView('dashboard');
    window.scrollTo({ top: 0, behavior: 'auto' });
    void ensureDashboardLoaded();
  };
  el('nav-dashboard-btn').addEventListener('click', openDashboard);
  el('open-dashboard-cta').addEventListener('click', openDashboard);

  // Landing search & demo controls
  el('landing-city-form').addEventListener('submit', async event => {
    event.preventDefault();
    try {
      await searchCity(el('landing-city-input').value, false, 'landing');
    } catch (error) {
      el('landing-city-results').replaceChildren();
      addText(el('landing-city-results'), 'span', 'small muted', error.message);
    }
  });

  el('landing-demo-scenario').addEventListener('change', () => {
    el('demo-scenario').value = el('landing-demo-scenario').value;
  });

  el('landing-demo-button').addEventListener('click', () => {
    const scenario = el('landing-demo-scenario').value;
    showView('dashboard', 'live');
    window.scrollTo({ top: 0, behavior: 'auto' });
    void loadSimulation(scenario);
  });

  // Dashboard search & demo controls
  el('city-form').addEventListener('submit', async event => {
    event.preventDefault();
    try { await searchCity(el('city-input').value, false, 'dashboard'); }
    catch (error) { status(error.message); }
  });

  el('demo-scenario').addEventListener('change', () => {
    el('landing-demo-scenario').value = el('demo-scenario').value;
  });

  el('demo-button').addEventListener('click', () => {
    void loadSimulation(el('demo-scenario').value);
  });

  // 4-Tab navigation with ArrowLeft / ArrowRight / Home / End keyboard support
  const tabButtons = [...document.querySelectorAll('[data-tab]')];
  tabButtons.forEach((btn, idx) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    btn.addEventListener('keydown', event => {
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        switchTab(tabButtons[(idx + 1) % tabButtons.length].dataset.tab, { focusTab: true });
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        switchTab(tabButtons[(idx - 1 + tabButtons.length) % tabButtons.length].dataset.tab, { focusTab: true });
      } else if (event.key === 'Home') {
        event.preventDefault();
        switchTab(tabButtons[0].dataset.tab, { focusTab: true });
      } else if (event.key === 'End') {
        event.preventDefault();
        switchTab(tabButtons[tabButtons.length - 1].dataset.tab, { focusTab: true });
      }
    });
  });

  // Slide-over Household Profile Drawer
  el('open-profile-btn').addEventListener('click', () => {
    if (el('profile').classList.contains('is-open')) closeProfileDrawer();
    else openProfileDrawer();
  });
  el('outlook-edit-profile').addEventListener('click', () => openProfileDrawer());
  el('close-profile-btn').addEventListener('click', () => closeProfileDrawer());
  el('profile-backdrop').addEventListener('click', () => closeProfileDrawer());
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && el('profile').classList.contains('is-open')) {
      event.preventDefault();
      closeProfileDrawer();
    }
  });

  el('refresh-button').addEventListener('click', () => void refreshPlan());
  el('chat-form').addEventListener('submit', sendChat);
  el('download-brief').addEventListener('click', downloadBrief);
  el('download-community').addEventListener('click', downloadCommunity);
  el('print-brief').addEventListener('click', () => window.print());

  document.querySelectorAll('[data-persona]').forEach(button => {
    button.addEventListener('click', () => applyPersona(button.dataset.persona));
  });
  document.querySelectorAll('[data-question]').forEach(button => {
    button.addEventListener('click', () => {
      el('chat-input').value = button.dataset.question;
      el('chat-input').focus();
    });
  });

  el('clear-chat').addEventListener('click', () => {
    el('chat-log').replaceChildren();
    appendChat('Conversation cleared from the screen. New questions will use the latest selected air-quality context.', 'assistant');
  });

  el('clear-local').addEventListener('click', () => {
    try {
      Object.keys(localStorage).filter(k => k.startsWith('airwise.')).forEach(k => localStorage.removeItem(k));
    } catch { /* ignore */ }
    resetProfileDefaults();
    status('Local AirWise preferences and saved city have been cleared.');
    if (state.city || state.simulation) void refreshPlan();
  });

  el('compare-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (!state.air || state.busy) return;
    const contextId = state.requestId;
    const selected = el('scenario-option').value;
    el('scenario-result').textContent = 'Comparing two tested plans using the same air conditions…';
    el('scenario-button').disabled = true;
    try {
      const data = await post('/compare', { ...requestContext(), alternativeId: selected });
      if (contextId !== state.requestId || selected !== el('scenario-option').value) return;
      showComparison(data.comparison);
    } catch (error) {
      if (contextId === state.requestId) el('scenario-result').textContent = `Comparison unavailable: ${error.message}`;
    } finally {
      if (contextId === state.requestId) el('scenario-button').disabled = false;
    }
  });

  el('impact-form').addEventListener('submit', async event => {
    event.preventDefault();
    try {
      const params = new URLSearchParams({
        distance: el('trip-distance').value,
        trips: el('trip-count').value,
        mode: el('trip-mode').value
      });
      const info = await api(`/travel-impact?${params}`);
      el('impact-result').textContent = `${info.vehicleKilometresNotDriven} ${info.unit} avoided. ${info.assumption} ${info.caveat}`;
    } catch (error) {
      el('impact-result').textContent = error.message;
    }
  });

  el('cadr-form').addEventListener('submit', async event => {
    event.preventDefault();
    await runRoomPlan();
  });

  el('room-source').addEventListener('change', () => {
    if (el('room-plan-result').childElementCount > 0) void runRoomPlan();
  });

  for (const name of PROFILE_FIELDS) {
    el(name).addEventListener('change', () => {
      document.querySelectorAll('[data-persona]').forEach(b => b.classList.remove('selected'));
      updateProfileSummary();
      safeSave('airwise.profile', profile());
      if (state.city || state.simulation) void refreshPlan();
      if ((name === 'home' || name === 'budget') && el('room-plan-result').childElementCount > 0) {
        void runRoomPlan();
      }
    });
  }

  document.querySelectorAll('[data-filter]').forEach(button => {
    button.addEventListener('click', () => {
      state.filter = button.dataset.filter;
      document.querySelectorAll('[data-filter]').forEach(b => {
        const active = b === button;
        b.classList.toggle('active', active);
        b.setAttribute('aria-pressed', String(active));
      });
      renderActions(state.plan?.recommendations || []);
    });
  });

  window.addEventListener('hashchange', () => {
    applyInitialRoute({ updateHash: false });
  });

  window.addEventListener('pagehide', stopLiveStream);
}

function applyInitialRoute({ updateHash = false } = {}) {
  const hash = window.location.hash.replace(/^#/, '').toLowerCase();
  if (hash === 'dashboard' || hash === 'live') {
    showView('dashboard', 'live', { updateHash });
    void ensureDashboardLoaded();
    return true;
  }
  if (hash === 'plan' || hash === 'indoor' || hash === 'community') {
    showView('dashboard', hash, { updateHash });
    void ensureDashboardLoaded();
    return true;
  }
  showView('landing', null, { updateHash });
  return false;
}

function finishBootLoader() {
  const loader = el('app-loader');
  if (!loader) return;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const dismiss = () => {
    loader.classList.add('is-done');
    document.body.classList.remove('is-booting');
    setTimeout(() => loader.classList.add('hidden'), reduced ? 0 : 380);
  };
  if (reduced) dismiss();
  else setTimeout(dismiss, 1150);
}

async function bootstrap() {
  finishBootLoader();
  const saved = safeLoad('airwise.profile');
  if (saved && typeof saved === 'object') {
    el('children').checked = saved.children === true;
    el('extra-care').checked = saved.extraCare === true;
    const selectMap = [
      ['commute', 'commute'],
      ['budget', 'budget'],
      ['home', 'home'],
      ['usual-hour', 'usualHour'],
      ['flexibility', 'flexibility'],
      ['max-shift', 'maxShiftMinutes'],
      ['outdoor-hour', 'outdoorHour'],
      ['cooking-hour', 'cookingHour']
    ];
    for (const [field, prop] of selectMap) {
      if (saved[prop] != null && [...el(field).options].some(o => o.value === String(saved[prop]))) {
        el(field).value = String(saved[prop]);
      }
    }
  }
  updateProfileSummary();
  installHandlers();
  startFreshnessTicker();

  const openedDashboard = applyInitialRoute({ updateHash: false });

  try {
    const info = await api('/health');
    state.aiConfigured = Boolean(info.aiEnabled);
    state.aiProvider = info.aiProvider || null;
    if (info.aiEnabled) {
      const providerLabel = info.aiProvider === 'gemini'
        ? 'GEMINI'
        : info.aiProvider === 'openai'
          ? 'OPENAI'
          : 'GENAI';
      el('ai-mode').textContent = `${providerLabel} CONFIGURED · NOT INDEPENDENTLY VERIFIED`;
    } else {
      el('ai-mode').textContent = 'RULES MODE · ADD AN API KEY FOR GENAI';
    }
  } catch {
    el('ai-mode').textContent = 'ASSISTANT · SERVER CONNECTION REQUIRED';
  }

  void loadPulse();

  if (!openedDashboard) {
    const savedCity = safeLoad('airwise.city');
    if (savedCity && typeof savedCity.name === 'string') {
      el('header-location').textContent = [savedCity.name, savedCity.country].filter(Boolean).join(', ');
    }
  }
}

bootstrap();
