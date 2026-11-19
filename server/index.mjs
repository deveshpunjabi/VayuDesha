import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getAir, getSimulatedAir, getLiveCityPulse, searchCities, validateCoordinates, DEMO_SCENARIOS } from './air.mjs';
import { buildPlan, normalizeProfile, minimumSmokeCadr, avoidedMotorizedDistance } from './decisions.mjs';
import { getAssistantReply, questionScope, activeAiProvider, activeAiModel } from './ai.mjs';
import { buildChoices, buildCommunityActions } from './choices.mjs';
import { compareHouseholds, ALTERNATIVE_OPTIONS } from './compare.mjs';
import { buildDailyRoutine, createCommunityBrief } from './routine.mjs';
import { buildRoomPlan } from './room.mjs';

const STATIC = fileURLToPath(new URL('../public/', import.meta.url));
const MAX_STREAMS = 20;
const MAX_STREAMS_PER_IP = 4;
const SSE_HEARTBEAT_MS = 25_000;
const SSE_REFRESH_MS = 5 * 60_000;
const SSE_MAX_LIFETIME_MS = 30 * 60_000;
let activeStreams = 0;
const streamsByIp = new Map();
const allowedStatic = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml']]
]);
const limits = new Map();
function limited(ip, kind) {
  const key = `${ip}:${kind}`;
  const now = Date.now();
  const record = limits.get(key);
  const quota = kind === 'chat' ? 7 : 45;
  if (!record || now - record.started > 60_000) {
    if (limits.size > 1000) limits.clear();
    limits.set(key, { started: now, count: 1 });
    return false;
  }
  record.count++;
  return record.count > quota;
}
function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(obj));
}
function securityHeaders(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  if (String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
}
async function readBody(req) {
  if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
    const error = new Error('Content-Type must be application/json.'); error.status = 415; throw error;
  }
  let length = 0; const chunks = [];
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 12_000) { const error = new Error('Request body too large.'); error.status = 413; throw error; }
    chunks.push(chunk);
  }
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { const error = new Error('Malformed JSON.'); error.status = 400; throw error; }
  if (!body || typeof body !== 'object' || Array.isArray(body)) { const error = new Error('JSON object required.'); error.status = 400; throw error; }
  return body;
}
function getTimezone(value) {
  const zone = typeof value === 'string' ? value.slice(0, 70) : 'UTC';
  try { new Intl.DateTimeFormat('en', { timeZone: zone }); return zone; }
  catch { return 'UTC'; }
}
export async function requestHandler(req, res) {
  securityHeaders(req, res);
  const url = new URL(req.url, 'http://localhost');
  const ip = req.socket.remoteAddress || 'unknown';
  try {
    if (url.pathname.startsWith('/api/')) {
      const kind = url.pathname === '/api/chat' ? 'chat' : 'general';
      if (limited(ip, kind)) return sendJson(res, 429, { error: 'Too many requests. Try again later.' });
      if (req.method === 'GET' && url.pathname === '/api/health') {
        const aiProvider = activeAiProvider();
        return sendJson(res, 200, {
          ok: true,
          aiEnabled: Boolean(aiProvider),
          aiProvider,
          aiModel: activeAiModel(),
          openaqEnabled: Boolean(String(process.env.OPENAQ_API_KEY || '').trim()),
          waqiEnabled: Boolean(String(process.env.WAQI_API_TOKEN || '').trim())
        });
      }
      if (req.method === 'GET' && url.pathname === '/api/pulse') {
        return sendJson(res, 200, await getLiveCityPulse());
      }
      if (req.method === 'GET' && url.pathname === '/api/stream') {
        const coords = validateCoordinates(url.searchParams.get('lat'), url.searchParams.get('lon'));
        const ipStreams = streamsByIp.get(ip) || 0;
        if (activeStreams >= MAX_STREAMS || ipStreams >= MAX_STREAMS_PER_IP) {
          return sendJson(res, 503, { error: 'Too many active live streams. Please try again shortly.' });
        }
        activeStreams++;
        streamsByIp.set(ip, ipStreams + 1);
        let closed = false;
        let heartbeatTimer = null;
        let refreshTimer = null;
        let lifetimeTimer = null;
        const cleanup = () => {
          if (closed) return;
          closed = true;
          activeStreams = Math.max(0, activeStreams - 1);
          const nextIpCount = (streamsByIp.get(ip) || 1) - 1;
          if (nextIpCount <= 0) streamsByIp.delete(ip);
          else streamsByIp.set(ip, nextIpCount);
          if (heartbeatTimer) clearInterval(heartbeatTimer);
          if (refreshTimer) clearInterval(refreshTimer);
          if (lifetimeTimer) clearTimeout(lifetimeTimer);
          heartbeatTimer = null;
          refreshTimer = null;
          lifetimeTimer = null;
        };
        const writeChunk = chunk => {
          if (closed || res.writableEnded) return;
          try { res.write(chunk); }
          catch { cleanup(); }
        };
        req.on('close', cleanup);
        res.on('close', cleanup);
        res.on('error', cleanup);
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'X-Content-Type-Options': 'nosniff',
          'X-Accel-Buffering': 'no'
        });
        res.flushHeaders?.();
        const pushUpdate = async () => {
          if (closed) return;
          try {
            const air = await getAir(coords.lat, coords.lon);
            if (closed) return;
            writeChunk(`event: air\ndata: ${JSON.stringify({ air, serverTime: new Date().toISOString() })}\n\n`);
          } catch {
            if (closed) return;
            writeChunk(`event: error\ndata: ${JSON.stringify({ error: 'Air-quality update temporarily unavailable.', serverTime: new Date().toISOString() })}\n\n`);
          }
        };
        if (process.env.VERCEL) {
          await pushUpdate();
          cleanup();
          if (!res.writableEnded) res.end();
          return;
        }
        heartbeatTimer = setInterval(() => {
          writeChunk(': heartbeat\n\n');
        }, SSE_HEARTBEAT_MS);
        heartbeatTimer.unref?.();
        refreshTimer = setInterval(() => {
          void pushUpdate();
        }, SSE_REFRESH_MS);
        refreshTimer.unref?.();
        lifetimeTimer = setTimeout(() => {
          cleanup();
          if (!res.writableEnded) res.end();
        }, SSE_MAX_LIFETIME_MS);
        lifetimeTimer.unref?.();
        await pushUpdate();
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/cities') {
        return sendJson(res, 200, { results: await searchCities(url.searchParams.get('q')) });
      }
      if (req.method === 'GET' && url.pathname === '/api/cadr') {
        const raw = url.searchParams.get('area');
        if (raw === null || raw === '') return sendJson(res, 400, { error: 'Room area is required.' });
        try { const suggestedCadrM3h = minimumSmokeCadr(raw);
          return sendJson(res, 200, { suggestedCadrM3h, unit: 'm³/h', basis: 'EPA smoke CADR guideline for a standard-height room; estimate only.', source: 'https://www.epa.gov/indoor-air-quality-iaq/guide-air-cleaners-home' });
        } catch (error) { return sendJson(res, 400, { error: error.message }); }
      }
      if (req.method === 'GET' && url.pathname === '/api/travel-impact') {
        try {
          return sendJson(res, 200, avoidedMotorizedDistance(url.searchParams.get('distance'), Number(url.searchParams.get('trips')), url.searchParams.get('mode')));
        } catch (error) { return sendJson(res, 400, { error: error.message }); }
      }
      if (req.method === 'GET' && url.pathname === '/api/compare-options') {
        return sendJson(res, 200, { options: ALTERNATIVE_OPTIONS });
      }
      if (req.method === 'GET' && url.pathname === '/api/scenarios') {
        return sendJson(res, 200, { scenarios: DEMO_SCENARIOS });
      }
      if (req.method === 'GET' && url.pathname === '/api/demo') {
        const air = getSimulatedAir(Date.now(), url.searchParams.get('scenario') || 'unhealthy');
        return sendJson(res, 200, { air, plan: buildPlan(air), choices: buildChoices(air), community: buildCommunityActions(air),
          routine: buildDailyRoutine(air), communityBrief: createCommunityBrief(air) });
      }
      if (req.method === 'GET' && url.pathname === '/api/air') {
        const air = await getAir(url.searchParams.get('lat'), url.searchParams.get('lon'));
        return sendJson(res, 200, { air });
      }
      if (req.method === 'POST' && (url.pathname === '/api/plan' || url.pathname === '/api/chat' || url.pathname === '/api/compare' || url.pathname === '/api/room-plan')) {
        const origin = req.headers.origin;
        const host = req.headers.host;
        if (origin) {
          let validOrigin = false;
          try { const parsed = new URL(origin); validOrigin = Boolean(host && parsed.host === host && ['http:', 'https:'].includes(parsed.protocol)); } catch {}
          if (!validOrigin) return sendJson(res, 403, { error: 'Cross-origin requests are not permitted.' });
        }
      }
      if (req.method === 'POST' && url.pathname === '/api/room-plan') {
        try { const body = await readBody(req); return sendJson(res, 200, { roomPlan: buildRoomPlan(body) }); }
        catch (error) { if(error.status) throw error; return sendJson(res, 400, { error: error.message }); }
      }
      if (req.method === 'POST' && url.pathname === '/api/plan') {
        const body = await readBody(req);
        let air;
        if (body.simulation === true) air = getSimulatedAir(Date.now(), body.demoScenario || 'unhealthy');
        else { validateCoordinates(body.lat, body.lon); air = await getAir(body.lat, body.lon); }
        const profile = normalizeProfile(body.profile);
        const timezone = getTimezone(body.timezone);
        return sendJson(res, 200, { air, plan: buildPlan(air, profile, timezone), routine: buildDailyRoutine(air, profile, timezone), choices: buildChoices(air, profile), community: buildCommunityActions(air, profile), communityBrief: createCommunityBrief(air, profile, timezone) });
      }
      if (req.method === 'POST' && url.pathname === '/api/compare') {
        const body = await readBody(req);
        const allowed = ALTERNATIVE_OPTIONS.some(option => option.id === body.alternativeId);
        if (!allowed) return sendJson(res, 400, { error: 'Choose one of the available household changes.' });
        const air = body.simulation === true ? getSimulatedAir(Date.now(), body.demoScenario || 'unhealthy') : await getAir(body.lat, body.lon);
        return sendJson(res, 200, { comparison: compareHouseholds(air, body.profile, body.alternativeId, getTimezone(body.timezone)) });
      }
      if (req.method === 'POST' && url.pathname === '/api/chat') {
        const body = await readBody(req);
        const question = body.question;
        if (typeof question !== 'string' || question.trim().length < 2 || question.length > 550) return sendJson(res, 400, { error: 'Question must contain 2 to 550 characters.' });
        const scope = questionScope(question);
        if (scope !== 'supported') {
          // Emergency/unsupported/clarification must remain available even when air APIs fail.
          return sendJson(res, 200, await getAssistantReply(question, null, normalizeProfile(body.profile), getTimezone(body.timezone)));
        }
        const air = body.simulation === true ? getSimulatedAir(Date.now(), body.demoScenario || 'unhealthy') : await getAir(body.lat, body.lon);
        const answer = await getAssistantReply(question, air, normalizeProfile(body.profile), getTimezone(body.timezone));
        return sendJson(res, 200, answer);
      }
      return sendJson(res, 404, { error: 'Unknown API endpoint.' });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'Method not allowed.' });
    const entry = allowedStatic.get(url.pathname);
    if (!entry) return sendJson(res, 404, { error: 'Not found.' });
    const [filename, mime] = entry;
    const file = path.join(STATIC, filename);
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime, 'Content-Length': body.length, 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (error) {
    if (res.headersSent) {
      if (!res.writableEnded) res.end();
      return;
    }
    const msg = error instanceof Error ? error.message : 'Unexpected error.';
    const badInput = /city name|coordinates|invalid latitude|longitude|required|JSON|Question|Content-Type|body too large|synthetic scenario/i.test(msg);
    const status = error.status ?? (badInput ? 400 : 503);
    // Keep underlying internal details out of public responses.
    sendJson(res, status, { error: status >= 500 ? 'The service is temporarily unavailable. Try again or consult official local reporting.' : msg });
  }
}
export function startServer(port = Number(process.env.PORT || 3000)) {
  const server = createServer(requestHandler);
  server.listen(port, () => console.log(`VayuDesha available at http://localhost:${server.address().port}`));
  return server;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = startServer();
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => {
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 3000).unref?.();
    });
  }
}
