/**
 * HTTP and Server-Sent Events (SSE) server entry point for VayuDesha.
 */
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
import {
  MAX_STREAMS,
  MAX_STREAMS_PER_IP,
  SSE_HEARTBEAT_MS,
  SSE_REFRESH_MS,
  SSE_MAX_LIFETIME_MS,
  ALLOWED_STATIC,
  limited,
  sendJson,
  securityHeaders,
  readBody,
  isValidSameOrigin,
  getTimezone
} from './http-helpers.mjs';

const STATIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));
const DEFAULT_PORT = 3000;
const SHUTDOWN_TIMEOUT_MS = 3000;
const MIN_QUESTION_LEN = 2;
const MAX_QUESTION_LEN = 550;

let activeStreams = 0;
const streamsByIp = new Map();

async function handleStreamRoute(req, res, url, ip) {
  const coords = validateCoordinates(url.searchParams.get('lat'), url.searchParams.get('lon'));
  const ipStreams = streamsByIp.get(ip) || 0;
  if (activeStreams >= MAX_STREAMS || ipStreams >= MAX_STREAMS_PER_IP) {
    return sendJson(res, 503, { error: 'Too many active live streams. Please try again shortly.' });
  }
  activeStreams++;
  streamsByIp.set(ip, ipStreams + 1);
  let closed = false;
  const timers = { heartbeat: null, refresh: null, lifetime: null };
  const cleanup = () => {
    if (closed) return;
    closed = true;
    activeStreams = Math.max(0, activeStreams - 1);
    const nextIpCount = (streamsByIp.get(ip) || 1) - 1;
    if (nextIpCount <= 0) streamsByIp.delete(ip);
    else streamsByIp.set(ip, nextIpCount);
    if (timers.heartbeat) clearInterval(timers.heartbeat);
    if (timers.refresh) clearInterval(timers.refresh);
    if (timers.lifetime) clearTimeout(timers.lifetime);
  };
  const writeChunk = chunk => {
    if (closed || res.writableEnded) return;
    try { res.write(chunk); }
    catch (_err) { cleanup(); }
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
      if (!closed) writeChunk(`event: air\ndata: ${JSON.stringify({ air, serverTime: new Date().toISOString() })}\n\n`);
    } catch (_err) {
      if (!closed) writeChunk(`event: error\ndata: ${JSON.stringify({ error: 'Air-quality update temporarily unavailable.', serverTime: new Date().toISOString() })}\n\n`);
    }
  };
  if (process.env.VERCEL) {
    await pushUpdate();
    cleanup();
    if (!res.writableEnded) res.end();
    return;
  }
  timers.heartbeat = setInterval(() => writeChunk(': heartbeat\n\n'), SSE_HEARTBEAT_MS);
  timers.heartbeat.unref?.();
  timers.refresh = setInterval(() => { void pushUpdate(); }, SSE_REFRESH_MS);
  timers.refresh.unref?.();
  timers.lifetime = setTimeout(() => { cleanup(); if (!res.writableEnded) res.end(); }, SSE_MAX_LIFETIME_MS);
  timers.lifetime.unref?.();
  await pushUpdate();
}

async function handleGetApiRoute(req, res, url, ip) {
  if (url.pathname === '/api/health') {
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
  if (url.pathname === '/api/pulse') return sendJson(res, 200, await getLiveCityPulse());
  if (url.pathname === '/api/stream') return handleStreamRoute(req, res, url, ip);
  if (url.pathname === '/api/cities') return sendJson(res, 200, { results: await searchCities(url.searchParams.get('q')) });
  if (url.pathname === '/api/cadr') {
    const raw = url.searchParams.get('area');
    if (raw === null || raw === '') return sendJson(res, 400, { error: 'Room area is required.' });
    try {
      return sendJson(res, 200, {
        suggestedCadrM3h: minimumSmokeCadr(raw),
        unit: 'm³/h',
        basis: 'EPA smoke CADR guideline for a standard-height room; estimate only.',
        source: 'https://www.epa.gov/indoor-air-quality-iaq/guide-air-cleaners-home'
      });
    } catch (error) { return sendJson(res, 400, { error: error.message }); }
  }
  if (url.pathname === '/api/travel-impact') {
    try {
      return sendJson(res, 200, avoidedMotorizedDistance(url.searchParams.get('distance'), Number(url.searchParams.get('trips')), url.searchParams.get('mode')));
    } catch (error) { return sendJson(res, 400, { error: error.message }); }
  }
  if (url.pathname === '/api/compare-options') return sendJson(res, 200, { options: ALTERNATIVE_OPTIONS });
  if (url.pathname === '/api/scenarios') return sendJson(res, 200, { scenarios: DEMO_SCENARIOS });
  if (url.pathname === '/api/demo') {
    const air = getSimulatedAir(Date.now(), url.searchParams.get('scenario') || 'unhealthy');
    return sendJson(res, 200, {
      air, plan: buildPlan(air), choices: buildChoices(air), community: buildCommunityActions(air),
      routine: buildDailyRoutine(air), communityBrief: createCommunityBrief(air)
    });
  }
  if (url.pathname === '/api/air') return sendJson(res, 200, { air: await getAir(url.searchParams.get('lat'), url.searchParams.get('lon')) });
  return sendJson(res, 404, { error: 'Unknown API endpoint.' });
}

async function handlePostApiRoute(req, res, url) {
  const validRoutes = new Set(['/api/plan', '/api/chat', '/api/compare', '/api/room-plan']);
  if (!validRoutes.has(url.pathname)) return sendJson(res, 404, { error: 'Unknown API endpoint.' });
  if (!isValidSameOrigin(req)) return sendJson(res, 403, { error: 'Cross-origin requests are not permitted.' });
  if (url.pathname === '/api/room-plan') {
    try { return sendJson(res, 200, { roomPlan: buildRoomPlan(await readBody(req)) }); }
    catch (error) { if (error.status) throw error; return sendJson(res, 400, { error: error.message }); }
  }
  const body = await readBody(req);
  const resolveAir = async () => body.simulation === true
    ? getSimulatedAir(Date.now(), body.demoScenario || 'unhealthy')
    : (validateCoordinates(body.lat, body.lon), getAir(body.lat, body.lon));

  if (url.pathname === '/api/plan') {
    const air = await resolveAir();
    const profile = normalizeProfile(body.profile);
    const timezone = getTimezone(body.timezone);
    return sendJson(res, 200, {
      air, plan: buildPlan(air, profile, timezone), routine: buildDailyRoutine(air, profile, timezone),
      choices: buildChoices(air, profile), community: buildCommunityActions(air, profile),
      communityBrief: createCommunityBrief(air, profile, timezone)
    });
  }
  if (url.pathname === '/api/compare') {
    if (!ALTERNATIVE_OPTIONS.some(option => option.id === body.alternativeId)) {
      return sendJson(res, 400, { error: 'Choose one of the available household changes.' });
    }
    const air = await resolveAir();
    return sendJson(res, 200, { comparison: compareHouseholds(air, body.profile, body.alternativeId, getTimezone(body.timezone)) });
  }
  const question = body.question;
  if (typeof question !== 'string' || question.trim().length < MIN_QUESTION_LEN || question.length > MAX_QUESTION_LEN) {
    return sendJson(res, 400, { error: 'Question must contain 2 to 550 characters.' });
  }
  const profile = normalizeProfile(body.profile);
  const timezone = getTimezone(body.timezone);
  if (questionScope(question) !== 'supported') {
    return sendJson(res, 200, await getAssistantReply(question, null, profile, timezone));
  }
  return sendJson(res, 200, await getAssistantReply(question, await resolveAir(), profile, timezone));
}

async function serveStaticRoute(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'Method not allowed.' });
  const entry = ALLOWED_STATIC.get(pathname);
  if (!entry) return sendJson(res, 404, { error: 'Not found.' });
  const [filename, mime] = entry;
  const body = await readFile(path.join(STATIC_DIR, filename));
  res.writeHead(200, { 'Content-Type': mime, 'Content-Length': body.length, 'Cache-Control': 'no-cache' });
  res.end(req.method === 'HEAD' ? undefined : body);
}

/**
 * Primary HTTP request handler for both standalone Node.js and Vercel serverless functions.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 */
export async function requestHandler(req, res) {
  securityHeaders(req, res);
  const url = new URL(req.url, 'http://localhost');
  const ip = req.socket?.remoteAddress || 'unknown';
  try {
    if (url.pathname.startsWith('/api/')) {
      const kind = url.pathname === '/api/chat' ? 'chat' : 'general';
      if (limited(ip, kind)) return sendJson(res, 429, { error: 'Too many requests. Try again later.' });
      if (req.method === 'GET') return await handleGetApiRoute(req, res, url, ip);
      if (req.method === 'POST') return await handlePostApiRoute(req, res, url);
      return sendJson(res, 404, { error: 'Unknown API endpoint.' });
    }
    return await serveStaticRoute(req, res, url.pathname);
  } catch (error) {
    if (res.headersSent) {
      if (!res.writableEnded) res.end();
      return;
    }
    const msg = error instanceof Error ? error.message : 'Unexpected error.';
    const badInput = /city name|coordinates|invalid latitude|longitude|required|JSON|Question|Content-Type|body too large|synthetic scenario/i.test(msg);
    const status = error.status ?? (badInput ? 400 : 503);
    sendJson(res, status, { error: status >= 500 ? 'The service is temporarily unavailable. Try again or consult official local reporting.' : msg });
  }
}

/**
 * Starts the HTTP server on the specified port.
 * @param {number} [port=Number(process.env.PORT || 3000)]
 * @returns {import('node:http').Server}
 */
export function startServer(port = Number(process.env.PORT || DEFAULT_PORT)) {
  const server = createServer(requestHandler);
  server.listen(port, () => console.log(`VayuDesha available at http://localhost:${server.address().port}`));
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = startServer();
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => {
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), SHUTDOWN_TIMEOUT_MS).unref?.();
    });
  }
}
