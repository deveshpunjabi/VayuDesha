/**
 * AI Assistant chat thinking/typing experience, live SSE stream management,
 * and 4-city pulse monitor cards.
 */
import { API, state, el, addText, displayNumber, labelTime, formatRelativeAge, api, post, requestContext, airSignature, setBusy } from './dom.js';

const THINKING_STEPS = Object.freeze([
  'Checking live air quality & weather dispersion...',
  'Reviewing your household schedule & commute...',
  'Preparing guidance...'
]);

/** @param {string} message @param {'user'|'assistant'} role */
export function appendChat(message, role) {
  const node = document.createElement('div');
  node.className = `chat-bubble ${role === 'user' ? 'user-bubble' : 'assistant-bubble'}`;
  node.textContent = message;
  el('chat-log').append(node);
  el('chat-log').scrollTop = el('chat-log').scrollHeight;
}

/** @param {Record<string, any>|null} response @returns {string} */
export function formatAiBadge(response) {
  return response?.mode === 'genai' ? 'AI Assistant · Live' : 'AI Assistant · Ready';
}

function createThinkingBubble() {
  const card = document.createElement('div');
  card.className = 'chat-thinking-card';
  const head = document.createElement('div');
  head.className = 'thinking-head';
  const orb = document.createElement('span');
  orb.className = 'thinking-orb';
  orb.setAttribute('aria-hidden', 'true');
  const title = document.createElement('span');
  title.textContent = 'Thinking...';
  head.append(orb, title);
  const phase = document.createElement('div');
  phase.className = 'thinking-phase';
  let idx = 0;
  phase.textContent = THINKING_STEPS[0];
  const timer = setInterval(() => { idx = (idx + 1) % THINKING_STEPS.length; phase.textContent = THINKING_STEPS[idx]; }, 900);
  card.append(head, phase);
  el('chat-log').append(card);
  el('chat-log').scrollTop = el('chat-log').scrollHeight;
  return { remove() { clearInterval(timer); card.remove(); } };
}

function typeChatReply(message) {
  const node = document.createElement('div');
  node.className = 'chat-bubble assistant-bubble';
  const textSpan = document.createElement('span');
  node.append(textSpan);
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  el('chat-log').append(node);
  if (reduced || message.length < 24) {
    textSpan.textContent = message;
    el('chat-log').scrollTop = el('chat-log').scrollHeight;
    return;
  }
  const cursor = document.createElement('span');
  cursor.className = 'typing-cursor';
  cursor.setAttribute('aria-hidden', 'true');
  node.append(cursor);
  const tokens = message.match(/\S+\s*/g) || [message];
  let i = 0;
  const stepSize = tokens.length > 90 ? 4 : tokens.length > 45 ? 3 : 2;
  const tick = () => {
    if (!node.isConnected) return;
    i = Math.min(tokens.length, i + stepSize);
    textSpan.textContent = tokens.slice(0, i).join('');
    el('chat-log').scrollTop = el('chat-log').scrollHeight;
    if (i < tokens.length) setTimeout(tick, 18);
    else { cursor.remove(); el('chat-log').scrollTop = el('chat-log').scrollHeight; }
  };
  tick();
}

/** @param {SubmitEvent} event */
export async function sendChat(event) {
  event.preventDefault();
  if (state.busy) return;
  const question = el('chat-input').value.trim();
  if (question.length < 2 || question.length > 550) return;
  el('chat-input').value = '';
  appendChat(question, 'user');
  const thinking = createThinkingBubble();
  const contextId = state.requestId;
  setBusy(true);
  try {
    const response = await post('/chat', { ...requestContext(), question });
    thinking.remove();
    if (contextId !== state.requestId) return;
    typeChatReply(response.reply);
    el('ai-mode').textContent = formatAiBadge(response);
  } catch (error) {
    thinking.remove();
    if (contextId === state.requestId) {
      const hint = !state.city && !state.simulation ? ' Select a city or load a sample scenario first.' : '';
      appendChat(`Unable to answer right now: ${error.message}${hint}`, 'assistant');
    }
  } finally {
    if (contextId === state.requestId) setBusy(false);
    el('chat-input').focus();
  }
}

/** Updates the status-strip live sync indicator dot and relative age label. */
export function updateSyncStatus() {
  const dot = document.querySelector('.status-strip .live-dot');
  const label = el('live-sync-status');
  if (state.simulation && state.air) {
    if (dot) dot.className = 'live-dot is-sim';
    label.textContent = 'Simulation · Static sample data';
    return;
  }
  if (state.streamMode === 'live' && state.city) {
    if (dot) dot.className = 'live-dot is-live';
    label.textContent = `Live stream · Updated ${formatRelativeAge(state.lastUpdatedAt)}`;
    return;
  }
  if (state.streamMode === 'fallback' && state.city) {
    if (dot) dot.className = 'live-dot is-live';
    label.textContent = `Auto-refresh (5m) · Updated ${formatRelativeAge(state.lastUpdatedAt)}`;
    return;
  }
  if (state.city && state.air) {
    if (dot) dot.className = 'live-dot is-live';
    label.textContent = `Live model · Updated ${formatRelativeAge(state.lastUpdatedAt)}`;
    return;
  }
  if (dot) dot.className = 'live-dot is-off';
  label.textContent = 'Live sync idle';
}

/** Closes any active Server-Sent Events stream and clears fallback polling timers. */
export function stopLiveStream() {
  if (state.eventSource) {
    try { state.eventSource.close(); }
    catch (_err) { /* ignore already-closed EventSource */ }
    state.eventSource = null;
  }
  if (state.fallbackPollTimer) {
    clearInterval(state.fallbackPollTimer);
    state.fallbackPollTimer = null;
  }
  if (!state.simulation) state.streamMode = 'idle';
  updateSyncStatus();
}

/** @param {Record<string, any>} city @param {() => void} onRender @param {() => void} onSilentRefresh */
export function startLiveStream(city, onRender, onSilentRefresh) {
  stopLiveStream();
  const startFallback = () => {
    if (state.fallbackPollTimer) return;
    state.streamMode = 'fallback';
    updateSyncStatus();
    state.fallbackPollTimer = setInterval(() => {
      if (!state.simulation && state.city && !state.busy) onSilentRefresh();
    }, 5 * 60_000);
  };
  if (!city || state.simulation || typeof EventSource === 'undefined') {
    state.streamMode = state.simulation ? 'sim' : 'idle';
    updateSyncStatus();
    return;
  }
  let es;
  try { es = new EventSource(`${API}/stream?lat=${encodeURIComponent(city.latitude)}&lon=${encodeURIComponent(city.longitude)}`); }
  catch (_err) { startFallback(); return; }
  state.eventSource = es;
  let errorCount = 0;
  es.addEventListener('air', event => {
    if (es !== state.eventSource || state.simulation) return;
    errorCount = 0;
    let payload;
    try { payload = JSON.parse(event.data); }
    catch (_err) { return; }
    if (!payload?.air) return;
    state.lastUpdatedAt = Date.now();
    state.streamMode = 'live';
    const nextSig = airSignature(payload.air);
    const prevSig = state.lastPlanSignature;
    state.air = payload.air;
    onRender();
    updateSyncStatus();
    if (prevSig && nextSig !== prevSig && !state.busy) onSilentRefresh();
  });
  es.addEventListener('error', event => {
    if (es !== state.eventSource || state.simulation) return;
    if (typeof event.data === 'string' && event.data.length > 0) {
      el('live-sync-status').textContent = 'Live stream · Provider update delayed';
      return;
    }
    errorCount++;
    if (es.readyState === EventSource.CLOSED || errorCount >= 2) {
      try { es.close(); } catch (_err) { /* ignore close error */ }
      if (state.eventSource === es) state.eventSource = null;
      startFallback();
    }
  });
}

function buildPulseCard(city, onSelectCity) {
  const card = document.createElement('button');
  card.type = 'button'; card.className = 'pulse-card'; card.dataset.tone = city.tone || 'unknown';
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
  const footNote = city.error ? city.error : city.time ? `Model ${labelTime(city.time, { timeZone: city.timezone || 'Asia/Kolkata' })}` : 'Open-Meteo CAMS';
  addText(foot, 'span', '', footNote);
  addText(foot, 'span', 'pulse-cta', 'Inspect →');
  card.addEventListener('click', () => onSelectCity(city));
  return card;
}

/** @param {(city: Record<string, any>) => void} onSelectCity */
export async function loadPulse(onSelectCity) {
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
    cities.forEach(city => grid.append(buildPulseCard(city, onSelectCity)));
    const anyAvailable = cities.some(c => Number.isFinite(c.aqi));
    if (pulseDot) pulseDot.className = anyAvailable ? 'live-dot is-live' : 'live-dot is-off';
    updated.textContent = anyAvailable ? `Updated ${labelTime(data.retrievedAt, { timeZone: 'Asia/Kolkata' })} IST · Open-Meteo / CAMS` : 'Live Open-Meteo pulse unreachable · Try a sample scenario';
  } catch (_err) {
    grid.replaceChildren();
    addText(grid, 'div', 'empty-state', 'Live multi-city pulse could not reach Open-Meteo right now. Search a city or load a synthetic sample scenario above.');
    updated.textContent = 'Live pulse unavailable';
    if (pulseDot) pulseDot.className = 'live-dot is-off';
  }
}
