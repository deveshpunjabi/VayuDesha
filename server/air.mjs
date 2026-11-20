/**
 * Open-Meteo / CAMS model adapter with surface meteorology and OpenAQ v3 / WAQI ground stations.
 * Never relabel Copernicus CAMS model output as observed station data or India CPCB AQI.
 */
import { categoryForUsAqi } from './decisions.mjs';
import {
  HOUR_MS, PULSE_CITIES, numberOrNull, finiteOrNull, normalizeIsoMinute, validateCoordinates,
  pm25ToUsAqi, pm10ToUsAqi, computeUsAqi, dispersionNoteForWind, normalizeWeather, normalizeAir,
  DEMO_SCENARIOS, getSimulatedAir
} from './air-math.mjs';

export {
  PULSE_CITIES, validateCoordinates, pm25ToUsAqi, pm10ToUsAqi, computeUsAqi,
  dispersionNoteForWind, normalizeWeather, normalizeAir, DEMO_SCENARIOS, getSimulatedAir
};

const AIR_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';
const GEO_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const OPENAQ_URL = 'https://api.openaq.org/v3';
const WAQI_URL = 'https://api.waqi.info/feed/geo:';

const MAX_CACHE_ENTRIES = 150;
const GEO_CACHE_TTL_MS = 24 * HOUR_MS;
const AIR_CACHE_TTL_MS = 20 * 60_000;
const PULSE_CACHE_TTL_MS = 10 * 60_000;
const OPENAQ_CUTOFF_MS = 48 * HOUR_MS;
const OPENAQ_FRESH_BUCKET_MS = 45 * 60_000;
const UPSTREAM_TIMEOUT_MS = 8500;
const STATION_TIMEOUT_MS = 6500;
const POLLUTANT_PRIORITY = Object.freeze(['pm25', 'pm10', 'no2', 'o3', 'so2', 'co']);

const cache = new Map();
const inFlight = new Map();
const fetcherCaches = new WeakMap();
const fetcherInFlight = new WeakMap();

function mapFor(fetcher, primary, weak) {
  if (fetcher === fetch) return primary;
  let store = weak.get(fetcher);
  if (!store) { store = new Map(); weak.set(fetcher, store); }
  return store;
}

async function cachedFor(fetcher, key, ttlMs, work) {
  const store = mapFor(fetcher, cache, fetcherCaches);
  const hit = store.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  store.delete(key);
  const pending = mapFor(fetcher, inFlight, fetcherInFlight);
  if (pending.has(key)) return pending.get(key);
  const promise = (async () => {
    const result = await work();
    if (store.size >= MAX_CACHE_ENTRIES) store.delete(store.keys().next().value);
    store.set(key, { expiresAt: Date.now() + ttlMs, value: result });
    return result;
  })();
  pending.set(key, promise);
  try { return await promise; }
  finally { pending.delete(key); }
}

/** @param {string} url @param {typeof fetch} [fetcher=fetch] @returns {Promise<Record<string, any>>} */
export async function requestJson(url, fetcher = fetch) {
  let response;
  try { response = await fetcher(url, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS), headers: { accept: 'application/json' } }); }
  catch (_err) { throw new Error('The air-quality provider is temporarily unreachable.'); }
  if (!response.ok) throw new Error('The air-quality provider did not return available data.');
  const payload = await response.json().catch(() => null);
  if (!payload || payload.error) throw new Error('The air-quality provider returned invalid data.');
  return payload;
}

/** @param {string} term @param {typeof fetch} [fetcher=fetch] @returns {Promise<Array<Record<string, any>>>} */
export async function searchCities(term, fetcher = fetch) {
  const city = String(term ?? '').trim();
  if (city.length < 2 || city.length > 65) throw new Error('Enter a city name (2–65 characters).');
  return cachedFor(fetcher, `geo:${city.toLowerCase()}`, GEO_CACHE_TTL_MS, async () => {
    const data = await requestJson(`${GEO_URL}?name=${encodeURIComponent(city)}&count=6&language=en`, fetcher);
    const list = Array.isArray(data.results) ? data.results : [];
    return list.filter(item => Number.isFinite(item.latitude) && Number.isFinite(item.longitude)).map(item => ({
      id: item.id, name: String(item.name).slice(0, 100), region: String(item.admin1 ?? '').slice(0, 90),
      country: String(item.country ?? '').slice(0, 70), timezone: String(item.timezone ?? 'UTC').slice(0, 80),
      latitude: item.latitude, longitude: item.longitude
    }));
  });
}

async function fetchWeather(lat, lon, fetcher = fetch) {
  try {
    const url = `${WEATHER_URL}?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,surface_pressure&timezone=GMT`;
    return normalizeWeather(await requestJson(url, fetcher));
  } catch (_err) { return null; }
}

function rankOpenAqCandidates(results, cutoffMs) {
  return results
    .filter(item => {
      if (!Number.isFinite(item?.id) || !Array.isArray(item.sensors) || !item.sensors.length) return false;
      const lastUtc = item.datetimeLast?.utc;
      return !(lastUtc && Number.isFinite(Date.parse(lastUtc)) && Date.parse(lastUtc) < cutoffMs);
    })
    .sort((a, b) => {
      const aPm = a.sensors.some(s => /^pm(25|10)$/i.test(String(s.parameter?.name || ''))) ? 1 : 0;
      const bPm = b.sensors.some(s => /^pm(25|10)$/i.test(String(s.parameter?.name || ''))) ? 1 : 0;
      if (aPm !== bPm) return bPm - aPm;
      const aBucket = Math.floor((Date.parse(a.datetimeLast?.utc || '') || 0) / OPENAQ_FRESH_BUCKET_MS);
      const bBucket = Math.floor((Date.parse(b.datetimeLast?.utc || '') || 0) / OPENAQ_FRESH_BUCKET_MS);
      if (aBucket !== bBucket) return bBucket - aBucket;
      const aDist = Number.isFinite(a.distance) ? a.distance : 999999;
      const bDist = Number.isFinite(b.distance) ? b.distance : 999999;
      if (Math.abs(aDist - bDist) > 1000) return aDist - bDist;
      const aRef = (a.isMonitor || /CPCB|AirNow|EPA|DEFRA/i.test(String(a.provider?.name || ''))) ? 1 : 0;
      const bRef = (b.isMonitor || /CPCB|AirNow|EPA|DEFRA/i.test(String(b.provider?.name || ''))) ? 1 : 0;
      return bRef - aRef;
    });
}

function extractStationReadings(station, measurements, cutoffMs) {
  const sensorMap = new Map(station.sensors.map(s => [s.id, s.parameter]));
  const readings = {};
  let latestTime = null;
  for (const m of measurements) {
    const param = sensorMap.get(m.sensorsId);
    const val = numberOrNull(m.value);
    if (!param?.name || val === null) continue;
    const dt = m.datetime?.utc || m.datetime?.local || null;
    const dtMs = dt ? Date.parse(dt) : NaN;
    if (Number.isFinite(dtMs) && dtMs < cutoffMs) continue;
    const key = String(param.name).toLowerCase();
    const prevMs = readings[key]?.time ? Date.parse(readings[key].time) : -Infinity;
    if (!readings[key] || (Number.isFinite(dtMs) && dtMs >= prevMs)) {
      readings[key] = { value: Math.round(val * 10) / 10, unit: String(param.units || 'µg/m³'), time: dt };
    }
    if (dt && (!latestTime || Date.parse(dt) > Date.parse(latestTime))) latestTime = dt;
  }
  return { readings, latestTime };
}

/** @param {number} lat @param {number} lon @param {typeof fetch} [fetcher=fetch] @returns {Promise<Record<string, any>|null>} */
export async function getOpenAqStation(lat, lon, fetcher = fetch) {
  const apiKey = String(process.env.OPENAQ_API_KEY || '').trim();
  if (!apiKey) return null;
  try {
    const headers = { accept: 'application/json', 'X-API-Key': apiKey };
    const locRes = await fetcher(`${OPENAQ_URL}/locations?coordinates=${lat},${lon}&radius=25000&parameters_id=2&limit=100`, { signal: AbortSignal.timeout(STATION_TIMEOUT_MS), headers });
    if (!locRes?.ok) return null;
    const locData = await locRes.json().catch(() => null);
    const cutoffMs = Date.now() - OPENAQ_CUTOFF_MS;
    const candidates = rankOpenAqCandidates(Array.isArray(locData?.results) ? locData.results : [], cutoffMs);
    const payloads = await Promise.all(candidates.slice(0, 3).map(async station => {
      try {
        const res = await fetcher(`${OPENAQ_URL}/locations/${encodeURIComponent(String(station.id))}/latest`, { signal: AbortSignal.timeout(STATION_TIMEOUT_MS), headers });
        if (!res?.ok) return null;
        const body = await res.json().catch(() => null);
        return { station, measurements: Array.isArray(body?.results) ? body.results : [] };
      } catch (_err) { return null; }
    }));
    let primaryStation = null;
    const mergedReadings = {};
    let latestTime = null;
    for (const item of payloads) {
      if (!item || !item.measurements.length) continue;
      const { readings, latestTime: stTime } = extractStationReadings(item.station, item.measurements, cutoffMs);
      if (!Object.keys(readings).length) continue;
      if (!primaryStation) primaryStation = item.station;
      if (stTime && (!latestTime || Date.parse(stTime) > Date.parse(latestTime))) latestTime = stTime;
      for (const [k, v] of Object.entries(readings)) { if (!mergedReadings[k]) mergedReadings[k] = v; }
    }
    if (!primaryStation) return null;
    const primaryKey = POLLUTANT_PRIORITY.find(k => mergedReadings[k]) || Object.keys(mergedReadings)[0];
    if (!primaryKey) return null;
    const providerName = primaryStation.provider?.name ? String(primaryStation.provider.name).slice(0, 60) : 'OpenAQ Network';
    return {
      stationName: String(primaryStation.name || primaryStation.locality || 'OpenAQ Ground Station').slice(0, 140),
      provider: providerName, aqi: computeUsAqi(mergedReadings.pm25?.value, mergedReadings.pm10?.value),
      primaryValue: mergedReadings[primaryKey].value, primaryUnit: mergedReadings[primaryKey].unit,
      dominantPollutant: primaryKey, readings: mergedReadings, time: mergedReadings[primaryKey].time || latestTime,
      source: `OpenAQ v3 (${providerName})`, sourceType: 'observed', url: `https://explore.openaq.org/locations/${primaryStation.id}`
    };
  } catch (_err) { return null; }
}

/** @param {number} lat @param {number} lon @param {typeof fetch} [fetcher=fetch] @returns {Promise<Record<string, any>|null>} */
export async function getObservedStation(lat, lon, fetcher = fetch) {
  const openAq = await getOpenAqStation(lat, lon, fetcher);
  if (openAq) return openAq;
  const token = String(process.env.WAQI_API_TOKEN || '').trim();
  if (!token) return null;
  try {
    const response = await fetcher(`${WAQI_URL}${lat};${lon}/?token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(STATION_TIMEOUT_MS), headers: { accept: 'application/json' } });
    if (!response?.ok) return null;
    const payload = await response.json().catch(() => null);
    if (!payload || payload.status !== 'ok' || !payload.data) return null;
    const rawAqi = payload.data.aqi;
    if (rawAqi === null || rawAqi === undefined || String(rawAqi).trim() === '') return null;
    const aqi = Number(rawAqi);
    if (!Number.isFinite(aqi) || aqi < 0) return null;
    const rawUrl = payload.data.city?.url;
    const dominantRaw = payload.data.dominentpol ?? payload.data.dominantpol ?? null;
    return {
      stationName: String(payload.data.city?.name || 'Ground monitoring station').slice(0, 140), aqi,
      dominantPollutant: dominantRaw ? String(dominantRaw).slice(0, 30) : null,
      time: payload.data.time?.iso || payload.data.time?.s || null, source: 'WAQI Ground Station',
      sourceType: 'observed', url: typeof rawUrl === 'string' && /^https?:\/\//i.test(rawUrl) ? rawUrl : null
    };
  } catch (_err) { return null; }
}

/** @param {unknown} rawLat @param {unknown} rawLon @param {typeof fetch} [fetcher=fetch] @returns {Promise<Record<string, any>>} */
export async function getAir(rawLat, rawLon, fetcher = fetch) {
  const coords = validateCoordinates(rawLat, rawLon);
  const lat = Math.round(coords.lat * 100) / 100;
  const lon = Math.round(coords.lon * 100) / 100;
  const obsTag = process.env.OPENAQ_API_KEY ? 'openaq' : process.env.WAQI_API_TOKEN ? 'waqi' : 'model';
  return cachedFor(fetcher, `air:${lat}:${lon}:${obsTag}`, AIR_CACHE_TTL_MS, async () => {
    const url = `${AIR_URL}?latitude=${lat}&longitude=${lon}&current=us_aqi,pm2_5,pm10,nitrogen_dioxide,ozone,sulphur_dioxide,carbon_monoxide&hourly=us_aqi,pm2_5,pm10&forecast_hours=30&timezone=GMT`;
    const [data, weather, observedStation] = await Promise.all([requestJson(url, fetcher), fetchWeather(lat, lon, fetcher), getObservedStation(lat, lon, fetcher)]);
    const air = normalizeAir(data, { lat, lon });
    if (fetcher === fetch) {
      if (observedStation && Number.isFinite(observedStation.aqi)) {
        air.current.aqi = observedStation.aqi;
        if (Number.isFinite(observedStation.readings?.pm25?.value)) air.current.pm25 = observedStation.readings.pm25.value;
        if (Number.isFinite(observedStation.readings?.pm10?.value)) air.current.pm10 = observedStation.readings.pm10.value;
      } else {
        air.current.aqi = computeUsAqi(air.current.pm25, air.current.pm10) ?? air.current.aqi;
      }
    }
    return { ...air, weather, observedStation };
  });
}

async function fetchSinglePulseCity(city, fetcher) {
  try {
    const airUrl = `${AIR_URL}?latitude=${city.latitude}&longitude=${city.longitude}&current=us_aqi,pm2_5&timezone=GMT`;
    const weatherUrl = `${WEATHER_URL}?latitude=${city.latitude}&longitude=${city.longitude}&current=wind_speed_10m,temperature_2m&timezone=GMT`;
    const [airData, weatherData, observed] = await Promise.all([
      requestJson(airUrl, fetcher),
      requestJson(weatherUrl, fetcher).catch(() => null),
      fetcher === fetch ? getOpenAqStation(city.latitude, city.longitude, fetcher).catch(() => null) : Promise.resolve(null)
    ]);
    let aqi = numberOrNull(airData?.current?.us_aqi);
    let pm25 = numberOrNull(airData?.current?.pm2_5);
    if (fetcher === fetch) {
      if (observed && Number.isFinite(observed.aqi)) {
        aqi = observed.aqi;
        if (Number.isFinite(observed.readings?.pm25?.value)) pm25 = observed.readings.pm25.value;
      } else {
        aqi = computeUsAqi(pm25, null) ?? aqi;
      }
    }
    if (aqi === null) throw new Error('Unavailable');
    const cat = categoryForUsAqi(aqi);
    const windRaw = numberOrNull(weatherData?.current?.wind_speed_10m);
    const tempRaw = finiteOrNull(weatherData?.current?.temperature_2m);
    return {
      ...city, aqi, pm25, windSpeed: windRaw === null ? null : Math.round(windRaw * 10) / 10,
      temperatureC: tempRaw === null ? null : Math.round(tempRaw * 10) / 10,
      category: cat.name, tone: cat.tone, time: normalizeIsoMinute(airData?.current?.time),
      index: 'US AQI', sourceType: 'model', source: 'Open-Meteo / Copernicus CAMS'
    };
  } catch (_err) {
    return { ...city, aqi: null, pm25: null, windSpeed: null, category: 'Unavailable', tone: 'unknown', time: null, index: 'US AQI', sourceType: 'model', source: 'Open-Meteo / Copernicus CAMS', error: 'Temporarily unavailable' };
  }
}

/** @param {typeof fetch} [fetcher=fetch] @returns {Promise<Record<string, any>>} */
export async function getLiveCityPulse(fetcher = fetch) {
  return cachedFor(fetcher, 'pulse:cities', PULSE_CACHE_TTL_MS, async () => ({
    cities: await Promise.all(PULSE_CITIES.map(city => fetchSinglePulseCity(city, fetcher))),
    retrievedAt: new Date().toISOString(), index: 'US AQI', sourceType: 'model',
    source: 'Open-Meteo / Copernicus CAMS',
    disclosure: 'Modelled regional conditions (US AQI), not local ground-sensor readings or Indian CPCB AQI.'
  }));
}
