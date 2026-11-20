/**
 * VayuDesha frontend controller: view/tab navigation, city search,
 * household plan orchestration, and event wiring.
 * Internal safety contract marker: GENAI-SELECTED · EVIDENCE-LOCKED
 */
import {
  PROFILE_FIELDS, state, el, safeLoad, safeSave, profile,
  timezone, labelTime, displayNumber, addText, status, api, post, requestContext,
  airSignature, setBusy, updateProfileSummary, openProfileDrawer, closeProfileDrawer,
  resetProfileDefaults, switchTab, showView, applyPersona
} from './dom.js';
import {
  renderScaleMarker, renderPollutantNumbersAndBars, renderChart,
  downloadBrief, downloadCommunity, runRoomPlan
} from './chart.js';
import {
  categoryText, renderObservedStation, renderWeather, renderComparison, renderActions,
  restoreCompleted, renderChecklist, renderRoutine, renderChoices, renderCommunity, showComparison
} from './render.js';
import { appendChat, sendChat, updateSyncStatus, stopLiveStream, startLiveStream, loadPulse } from './chat.js';

/** Synchronizes all dashboard panels with the current air and household plan state. */
export function render() {
  const { air, plan } = state;
  el('air-hero').dataset.tone = plan?.category?.tone || 'unknown';
  const simActive = Boolean(state.simulation && air);
  const simBanner = el('simulation-banner');
  simBanner.classList.toggle('hidden', !simActive);
  simBanner.hidden = !simActive;
  simBanner.setAttribute('aria-hidden', String(!simActive));
  const title = state.simulation ? 'Sample city · simulation' : state.city ? `${state.city.name}, ${state.city.country}` : 'Delhi, India';
  el('air-title').textContent = title;
  el('header-location').textContent = state.simulation ? `Sample (${state.demoScenario})` : title;
  el('aqi-number').textContent = displayNumber(air?.current?.aqi);
  el('aqi-category').textContent = plan?.category?.name || 'Not available';
  renderScaleMarker(air?.current?.aqi);
  renderPollutantNumbersAndBars(air);
  renderWeather(air);
  renderObservedStation(air?.observedStation || null);
  el('air-description').textContent = plan ? categoryText(plan.category.level) : 'Understand your local forecast before changing your plans.';
  el('air-timestamp').textContent = air ? `Model timestamp: ${labelTime(air.current.time, { day: 'numeric', month: 'short' })} · ${timezone()}` : 'No current model data loaded';
  el('data-source-badge').textContent = state.simulation && air ? 'SAMPLE ONLY' : air ? 'CAMS MODEL' : 'AWAITING DATA';
  el('model-mode').textContent = air ? (state.simulation ? 'Sample scenario' : 'CAMS model forecast') : 'Ready to load air data';
  el('outlook-headline').textContent = plan?.headline || 'Your personalized outlook will appear here once a location is selected.';
  el('source-disclosure').textContent = air?.disclosure || 'This app uses Open-Meteo / Copernicus CAMS regional model data in live mode, reported on the US AQI scale—not official CPCB Indian National AQI.';
  const best = plan?.window;
  el('best-time').textContent = !air ? 'Waiting for forecast' : best ? labelTime(best.time, { weekday: 'short' })
    : plan?.profile?.flexibility === 'fixed' ? 'Fixed schedule — no shift'
      : (plan?.profile?.maxShiftMinutes ?? 15) < 60 ? 'Sub-hour shift — keep routine' : 'No lower forecast hour';
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
  el('brief-status').textContent = air ? (state.simulation ? 'PERSONAL BRIEF · SYNTHETIC DEMO' : 'PERSONAL BRIEF · REGIONAL MODEL DATA') : 'PERSONAL BRIEF · LOADING LIVE DELHI TELEMETRY';
  updateSyncStatus();
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
    state.air = data.air; state.plan = data.plan; state.routine = data.routine;
    state.communityBrief = data.communityBrief; state.choices = data.choices; state.community = data.community;
    state.lastUpdatedAt = Date.now(); state.lastPlanSignature = airSignature(data.air);
    restoreCompleted();
    render();
    if (el('room-plan-result').childElementCount > 0) void runRoomPlan();
    if (!silent) status(state.simulation ? 'Loaded synthetic sample data for demonstration only.' : 'Loaded regional, modelled data. Check the source and timestamp before acting.');
  } catch (error) {
    if (requestId !== state.requestId || silent) return;
    state.air = null; state.plan = null; state.routine = null; state.communityBrief = null; state.choices = null; state.community = []; state.lastPlanSignature = null;
    el('scenario-result').textContent = 'Reload the plan to compare this location and household context.';
    render();
    status(`${error.message} Try another city, retry, or explore the sample scenario.`);
  } finally {
    if (!silent && requestId === state.requestId) { el('dashboard-view').classList.remove('is-loading'); setBusy(false); }
  }
}

async function selectCity(city) {
  state.searchId++;
  stopLiveStream();
  state.city = city; state.simulation = false; state.air = null; state.plan = null; state.routine = null;
  state.communityBrief = null; state.choices = null; state.community = []; state.lastPlanSignature = null; state.lastUpdatedAt = null;
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
    startLiveStream(city, render, () => { void refreshPlan({ silent: true }); });
  }
}

async function searchCity(query, chooseAutomatically = false, origin = 'dashboard') {
  const searchId = ++state.searchId;
  const resultsEl = origin === 'landing' ? el('landing-city-results') : el('city-results');
  resultsEl.replaceChildren();
  status('Searching for matching cities…');
  if (origin === 'landing') addText(resultsEl, 'span', 'small muted', 'Searching matching cities…');
  const { results } = await api(`/cities?q=${encodeURIComponent(query.trim())}`);
  if (searchId !== state.searchId) return;
  resultsEl.replaceChildren();
  if (!results.length) {
    const msg = 'No matching cities found. Try adding a country.';
    status(msg);
    if (origin === 'landing') addText(resultsEl, 'span', 'small muted', msg);
    return;
  }
  if (chooseAutomatically) { await selectCity(results.find(r => r.country.toLowerCase() === 'india') || results[0]); return; }
  status(`Found ${results.length} matching locations. Select the correct one.`);
  results.forEach(city => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'city-option';
    button.textContent = [city.name, city.region, city.country].filter(Boolean).join(', ');
    button.addEventListener('click', () => {
      if (state.view !== 'dashboard') { showView('dashboard', 'live'); window.scrollTo({ top: 0, behavior: 'auto' }); }
      void selectCity(city);
    });
    resultsEl.append(button);
  });
}

async function ensureDashboardLoaded() {
  if (state.city || state.simulation || state.busy) return;
  const savedCity = safeLoad('airwise.city');
  if (savedCity && Number.isFinite(savedCity.latitude) && Number.isFinite(savedCity.longitude) && typeof savedCity.name === 'string') {
    await selectCity(savedCity);
    return;
  }
  const delhi = state.pulseCities.find(c => c.id === 'delhi');
  await selectCity({
    name: delhi?.name || 'Delhi', region: delhi?.region || 'Delhi', country: delhi?.country || 'India',
    timezone: delhi?.timezone || 'Asia/Kolkata', latitude: delhi?.latitude ?? 28.61, longitude: delhi?.longitude ?? 77.21
  });
}

function applyInitialRoute({ updateHash = false } = {}) {
  const hash = window.location.hash.replace(/^#/, '').toLowerCase();
  if (hash === 'dashboard' || hash === 'live' || hash === 'plan' || hash === 'indoor' || hash === 'community') {
    showView('dashboard', hash === 'dashboard' ? 'live' : hash, { updateHash });
    void ensureDashboardLoaded();
    return true;
  }
  showView('landing', null, { updateHash });
  return false;
}

function installNavigationHandlers() {
  const goLanding = event => { event?.preventDefault?.(); closeProfileDrawer({ restoreFocus: false }); showView('landing'); window.scrollTo({ top: 0, behavior: 'auto' }); };
  const openDashboard = () => { closeProfileDrawer({ restoreFocus: false }); showView('dashboard'); window.scrollTo({ top: 0, behavior: 'auto' }); void ensureDashboardLoaded(); };
  el('brand-home-link').addEventListener('click', goLanding);
  el('nav-home-btn').addEventListener('click', goLanding);
  el('nav-dashboard-btn').addEventListener('click', openDashboard);
  el('open-dashboard-cta').addEventListener('click', openDashboard);
  const tabButtons = [...document.querySelectorAll('[data-tab]')];
  tabButtons.forEach((btn, idx) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    btn.addEventListener('keydown', event => {
      const moves = { ArrowRight: (idx + 1) % tabButtons.length, ArrowLeft: (idx - 1 + tabButtons.length) % tabButtons.length, Home: 0, End: tabButtons.length - 1 };
      if (Object.hasOwn(moves, event.key)) { event.preventDefault(); switchTab(tabButtons[moves[event.key]].dataset.tab, { focusTab: true }); }
    });
  });
  el('open-profile-btn').addEventListener('click', () => (el('profile').classList.contains('is-open') ? closeProfileDrawer() : openProfileDrawer()));
  el('outlook-edit-profile').addEventListener('click', () => openProfileDrawer());
  el('close-profile-btn').addEventListener('click', () => closeProfileDrawer());
  el('profile-backdrop').addEventListener('click', () => closeProfileDrawer());
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && el('profile').classList.contains('is-open')) { event.preventDefault(); closeProfileDrawer(); } });
  window.addEventListener('hashchange', () => applyInitialRoute({ updateHash: false }));
  window.addEventListener('pagehide', stopLiveStream);
}

function installActionAndToolHandlers() {
  el('landing-city-form').addEventListener('submit', async event => {
    event.preventDefault();
    try { await searchCity(el('landing-city-input').value, false, 'landing'); }
    catch (error) { el('landing-city-results').replaceChildren(); addText(el('landing-city-results'), 'span', 'small muted', error.message); }
  });
  el('city-form').addEventListener('submit', async event => {
    event.preventDefault();
    try { await searchCity(el('city-input').value, false, 'dashboard'); }
    catch (error) { status(error.message); }
  });
  el('refresh-button').addEventListener('click', () => void refreshPlan());
  el('chat-form').addEventListener('submit', sendChat);
  el('download-brief').addEventListener('click', downloadBrief);
  el('download-community').addEventListener('click', downloadCommunity);
  el('print-brief').addEventListener('click', () => window.print());
  document.querySelectorAll('[data-persona]').forEach(btn => btn.addEventListener('click', () => applyPersona(btn.dataset.persona, () => { void refreshPlan(); })));
  document.querySelectorAll('[data-question]').forEach(btn => btn.addEventListener('click', () => { el('chat-input').value = btn.dataset.question; el('chat-input').focus(); }));
  el('clear-chat').addEventListener('click', () => { el('chat-log').replaceChildren(); appendChat('Conversation cleared from the screen. New questions will use the latest selected air-quality context.', 'assistant'); });
  el('clear-local').addEventListener('click', () => {
    try { Object.keys(localStorage).filter(k => k.startsWith('airwise.')).forEach(k => localStorage.removeItem(k)); }
    catch (_err) { /* ignore storage restrictions */ }
    resetProfileDefaults();
    status('Local VayuDesha preferences and saved city have been cleared.');
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
      if (contextId === state.requestId && selected === el('scenario-option').value) showComparison(data.comparison);
    } catch (error) {
      if (contextId === state.requestId) el('scenario-result').textContent = `Comparison unavailable: ${error.message}`;
    } finally {
      if (contextId === state.requestId) el('scenario-button').disabled = false;
    }
  });
  el('impact-form').addEventListener('submit', async event => {
    event.preventDefault();
    try {
      const params = new URLSearchParams({ distance: el('trip-distance').value, trips: el('trip-count').value, mode: el('trip-mode').value });
      const info = await api(`/travel-impact?${params}`);
      el('impact-result').textContent = `${info.vehicleKilometresNotDriven} ${info.unit} avoided. ${info.assumption}${info.referenceBenchmark ? ` ${info.referenceBenchmark}` : ''} ${info.caveat}`;
    } catch (error) { el('impact-result').textContent = error.message; }
  });
  el('cadr-form').addEventListener('submit', async event => { event.preventDefault(); await runRoomPlan(); });
  el('room-source').addEventListener('change', () => { if (el('room-plan-result').childElementCount > 0) void runRoomPlan(); });
  for (const name of PROFILE_FIELDS) {
    el(name).addEventListener('change', () => {
      document.querySelectorAll('[data-persona]').forEach(b => b.classList.remove('selected'));
      updateProfileSummary();
      safeSave('airwise.profile', profile());
      if (state.city || state.simulation) void refreshPlan();
      if ((name === 'home' || name === 'budget') && el('room-plan-result').childElementCount > 0) void runRoomPlan();
    });
  }
  document.querySelectorAll('[data-filter]').forEach(button => {
    button.addEventListener('click', () => {
      state.filter = button.dataset.filter;
      document.querySelectorAll('[data-filter]').forEach(b => { b.classList.toggle('active', b === button); b.setAttribute('aria-pressed', String(b === button)); });
      renderActions(state.plan?.recommendations || []);
    });
  });
}

async function bootstrap() {
  const loader = el('app-loader');
  if (loader) {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const dismiss = () => { loader.classList.add('is-done'); document.body.classList.remove('is-booting'); setTimeout(() => loader.classList.add('hidden'), reduced ? 0 : 380); };
    if (reduced) dismiss(); else setTimeout(dismiss, 1150);
  }
  const saved = safeLoad('airwise.profile');
  if (saved && typeof saved === 'object') {
    el('children').checked = saved.children === true;
    el('extra-care').checked = saved.extraCare === true;
    for (const [field, prop] of [['commute', 'commute'], ['budget', 'budget'], ['home', 'home'], ['usual-hour', 'usualHour'], ['flexibility', 'flexibility'], ['max-shift', 'maxShiftMinutes'], ['outdoor-hour', 'outdoorHour'], ['cooking-hour', 'cookingHour']]) {
      if (saved[prop] != null && [...el(field).options].some(o => o.value === String(saved[prop]))) el(field).value = String(saved[prop]);
    }
  }
  updateProfileSummary();
  installNavigationHandlers();
  installActionAndToolHandlers();
  if (state.tickerTimer) clearInterval(state.tickerTimer);
  state.tickerTimer = setInterval(updateSyncStatus, 30_000);
  const openedDashboard = applyInitialRoute({ updateHash: false });
  try {
    const info = await api('/health');
    state.aiConfigured = Boolean(info.aiEnabled); state.aiProvider = info.aiProvider || null; state.aiModel = info.aiModel || null;
    el('ai-mode').textContent = info.aiEnabled ? 'AI Assistant · Live' : 'AI Assistant · Ready';
  } catch (_err) {
    el('ai-mode').textContent = 'ASSISTANT · SERVER CONNECTION REQUIRED';
  }
  void loadPulse(city => {
    showView('dashboard', 'live');
    window.scrollTo({ top: 0, behavior: 'auto' });
    void selectCity({ name: city.name, region: city.region, country: city.country, timezone: city.timezone || 'Asia/Kolkata', latitude: city.latitude, longitude: city.longitude });
  });
  if (!openedDashboard) void ensureDashboardLoaded();
}

bootstrap();
