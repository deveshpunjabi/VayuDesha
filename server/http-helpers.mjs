/**
 * Pure HTTP security headers, rate-limiting, body parsing, origin checks,
 * and static asset whitelist helpers for VayuDesha.
 */

export const MAX_STREAMS = 20;
export const MAX_STREAMS_PER_IP = 4;
export const SSE_HEARTBEAT_MS = 25_000;
export const SSE_REFRESH_MS = 5 * 60_000;
export const SSE_MAX_LIFETIME_MS = 30 * 60_000;
export const MAX_BODY_BYTES = 12_000;
export const RATE_WINDOW_MS = 60_000;
export const MAX_RATE_BUCKETS = 1000;
export const CHAT_RATE_LIMIT = 7;
export const GENERAL_RATE_LIMIT = 45;

export const ALLOWED_STATIC = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/dom.js', ['dom.js', 'text/javascript; charset=utf-8']],
  ['/chart.js', ['chart.js', 'text/javascript; charset=utf-8']],
  ['/render.js', ['render.js', 'text/javascript; charset=utf-8']],
  ['/chat.js', ['chat.js', 'text/javascript; charset=utf-8']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml']]
]);

const CSP_POLICY = [
  "default-src 'self'",
  "connect-src 'self'",
  "img-src 'self' data:",
  "style-src 'self'",
  "script-src 'self'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'"
].join('; ');

const limits = new Map();

/**
 * Checks per-IP sliding-window rate limits for chat and general API endpoints.
 * @param {string} ip
 * @param {'chat'|'general'} kind
 * @returns {boolean}
 */
export function limited(ip, kind) {
  const key = `${ip}:${kind}`;
  const now = Date.now();
  const record = limits.get(key);
  const quota = kind === 'chat' ? CHAT_RATE_LIMIT : GENERAL_RATE_LIMIT;
  if (!record || now - record.started > RATE_WINDOW_MS) {
    if (limits.size > MAX_RATE_BUCKETS) limits.clear();
    limits.set(key, { started: now, count: 1 });
    return false;
  }
  record.count++;
  return record.count > quota;
}

/**
 * Sends a JSON HTTP response with strict cache-control and nosniff headers.
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {Record<string, any>} obj
 */
export function sendJson(res, status, obj) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(JSON.stringify(obj));
}

/**
 * Attaches hardened security headers (CSP, COOP, CORP, X-Frame-Options, HSTS) to every response.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 */
export function securityHeaders(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', CSP_POLICY);
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  if (String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
}

/**
 * Reads and parses a bounded JSON object body (max 12 KB) from an incoming POST request.
 * @param {import('node:http').IncomingMessage} req
 * @returns {Promise<Record<string, any>>}
 */
export async function readBody(req) {
  if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
    const error = new Error('Content-Type must be application/json.');
    error.status = 415;
    throw error;
  }
  let length = 0;
  const chunks = [];
  for await (const chunk of req) {
    length += chunk.length;
    if (length > MAX_BODY_BYTES) {
      const error = new Error('Request body too large.');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (_err) {
    const error = new Error('Malformed JSON.');
    error.status = 400;
    throw error;
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    const error = new Error('JSON object required.');
    error.status = 400;
    throw error;
  }
  return body;
}

/**
 * Verifies that an incoming POST request Origin header matches the Host header.
 * @param {import('node:http').IncomingMessage} req
 * @returns {boolean}
 */
export function isValidSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  const host = req.headers.host;
  try {
    const parsed = new URL(origin);
    return Boolean(host && parsed.host === host && ['http:', 'https:'].includes(parsed.protocol));
  } catch (_err) {
    return false;
  }
}

/**
 * Validates an IANA timezone identifier or falls back safely to UTC.
 * @param {unknown} value
 * @returns {string}
 */
export function getTimezone(value) {
  const zone = typeof value === 'string' ? value.slice(0, 70) : 'UTC';
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return zone;
  } catch (_err) {
    return 'UTC';
  }
}
