/** Open-Meteo / CAMS model adapter with optional meteorology and WAQI ground-station comparison.
 * Never relabel Copernicus CAMS model output as observed station data or India CPCB AQI.
 */
import { categoryForUsAqi } from './decisions.mjs';

const AIR_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';
const GEO_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const OPENAQ_URL = 'https://api.openaq.org/v3';
const WAQI_URL = 'https://api.waqi.info/feed/geo:';
const cache = new Map();
const inFlight = new Map();
const fetcherCaches = new WeakMap();
const fetcherInFlight = new WeakMap();
const MAX_CACHE = 150;

function storeFor(fetcher) {
  if (fetcher === fetch) return cache;
  let store = fetcherCaches.get(fetcher);
  if (!store) {
    store = new Map();
    fetcherCaches.set(fetcher, store);
  }
  return store;
}
function pendingFor(fetcher) {
  if (fetcher === fetch) return inFlight;
  let map = fetcherInFlight.get(fetcher);
  if (!map) {
    map = new Map();
    fetcherInFlight.set(fetcher, map);
  }
  return map;
}
function cacheGet(store, key) {
  const hit = store.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  store.delete(key);
  return null;
}
async function cachedFor(fetcher, key, ttlMs, work) {
  const store = storeFor(fetcher);
  const prior = cacheGet(store, key);
  if (prior) return prior;
  const pending = pendingFor(fetcher);
  if (pending.has(key)) return pending.get(key);
  const promise = (async () => {
    const result = await work();
    if (store.size >= MAX_CACHE) store.delete(store.keys().next().value);
    store.set(key, { expiresAt: Date.now() + ttlMs, value: result });
    return result;
  })();
  pending.set(key, promise);
  try { return await promise; }
  finally { pending.delete(key); }
}
function numberOrNull(value) {
  return Number.isFinite(value) && value >= 0 ? value : null;
}
function finiteOrNull(value) {
  return Number.isFinite(value) ? value : null;
}
function normalizeIsoMinute(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d\d:\d\d$/.test(value) ? `${value}Z` : null;
}
export function validateCoordinates(latRaw, lonRaw) {
  if (latRaw == null || lonRaw == null || String(latRaw).trim() === '' || String(lonRaw).trim() === '') throw new Error('City coordinates are required.');
  const lat = Number(latRaw), lon = Number(lonRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    throw new Error('Invalid latitude or longitude.');
  }
  return { lat, lon };
}
export async function requestJson(url, fetcher = fetch) {
  let response;
  try { response = await fetcher(url, { signal: AbortSignal.timeout(8500), headers: { accept: 'application/json' } }); }
  catch { throw new Error('The air-quality provider is temporarily unreachable.'); }
  if (!response.ok) throw new Error('The air-quality provider did not return available data.');
  const payload = await response.json().catch(() => null);
  if (!payload || payload.error) throw new Error('The air-quality provider returned invalid data.');
  return payload;
}
export async function searchCities(term, fetcher = fetch) {
  const city = String(term ?? '').trim();
  if (city.length < 2 || city.length > 65) throw new Error('Enter a city name (2–65 characters).');
  return cachedFor(fetcher, `geo:${city.toLowerCase()}`, 24 * 60 * 60_000, async () => {
    const url = new URL(GEO_URL);
    url.searchParams.set('name', city);
    url.searchParams.set('count', '6');
    url.searchParams.set('language', 'en');
    const data = await requestJson(url.toString(), fetcher);
    return (Array.isArray(data.results) ? data.results : []).filter(item =>
      Number.isFinite(item.latitude) && Number.isFinite(item.longitude)
    ).map(item => ({
      id: item.id,
      name: String(item.name).slice(0, 100),
      region: String(item.admin1 ?? '').slice(0, 90),
      country: String(item.country ?? '').slice(0, 70),
      timezone: String(item.timezone ?? 'UTC').slice(0, 80),
      latitude: item.latitude,
      longitude: item.longitude
    }));
  });
}
export function dispersionNoteForWind(windSpeedKmh) {
  if (!Number.isFinite(windSpeedKmh) || windSpeedKmh < 0) {
    return 'Surface wind speed is unavailable; local dispersion cannot be characterized.';
  }
  if (windSpeedKmh < 8) return 'Light winds can slow dispersion of urban smoke and particulate matter.';
  if (windSpeedKmh <= 18) return 'Moderate surface wind aids partial dispersion.';
  return 'Stronger surface wind supports faster dispersion of local emissions.';
}
export function normalizeWeather(data) {
  const c = data?.current;
  if (!c || typeof c !== 'object') return null;
  const temperatureRaw = finiteOrNull(c.temperature_2m);
  const humidityRaw = numberOrNull(c.relative_humidity_2m);
  const windRaw = numberOrNull(c.wind_speed_10m);
  const pressureRaw = numberOrNull(c.surface_pressure);
  if (temperatureRaw === null && humidityRaw === null && windRaw === null && pressureRaw === null) return null;
  const temperatureC = temperatureRaw === null ? null : Math.round(temperatureRaw * 10) / 10;
  const humidityPct = humidityRaw === null ? null : Math.round(humidityRaw);
  const windSpeedKmh = windRaw === null ? null : Math.round(windRaw * 10) / 10;
  const pressureHpa = pressureRaw === null ? null : Math.round(pressureRaw);
  return {
    temperatureC,
    humidityPct,
    windSpeedKmh,
    pressureHpa,
    dispersionNote: dispersionNoteForWind(windSpeedKmh),
    source: 'Open-Meteo Weather'
  };
}
async function fetchWeather(lat, lon, fetcher = fetch) {
  try {
    const url = new URL(WEATHER_URL);
    url.searchParams.set('latitude', String(lat));
    url.searchParams.set('longitude', String(lon));
    url.searchParams.set('current', 'temperature_2m,relative_humidity_2m,wind_speed_10m,surface_pressure');
    url.searchParams.set('timezone', 'GMT');
    const data = await requestJson(url.toString(), fetcher);
    return normalizeWeather(data);
  } catch {
    return null;
  }
}
export function pm25ToUsAqi(pm25) {
  if (!Number.isFinite(pm25) || pm25 < 0) return null;
  const c = Math.floor(pm25 * 10) / 10;
  const bp = [
    [0.0, 9.0, 0, 50],
    [9.1, 35.4, 51, 100],
    [35.5, 55.4, 101, 150],
    [55.5, 125.4, 151, 200],
    [125.5, 225.4, 201, 300],
    [225.5, 325.4, 301, 400],
    [325.5, 500.4, 401, 500]
  ];
  for (const [cLo, cHi, iLo, iHi] of bp) {
    if (c <= cHi) return Math.round(((iHi - iLo) / (cHi - cLo)) * (c - cLo) + iLo);
  }
  return 500;
}

export function pm10ToUsAqi(pm10) {
  if (!Number.isFinite(pm10) || pm10 < 0) return null;
  const c = Math.floor(pm10);
  const bp = [
    [0, 54, 0, 50],
    [55, 154, 51, 100],
    [155, 254, 101, 150],
    [255, 354, 151, 200],
    [355, 424, 201, 300],
    [425, 604, 301, 500]
  ];
  for (const [cLo, cHi, iLo, iHi] of bp) {
    if (c <= cHi) return Math.round(((iHi - iLo) / (cHi - cLo)) * (c - cLo) + iLo);
  }
  return 500;
}

export function computeUsAqi(pm25, pm10) {
  const a25 = pm25ToUsAqi(pm25);
  const a10 = pm10ToUsAqi(pm10);
  if (a25 !== null && a10 !== null) return Math.max(a25, a10);
  return a25 ?? a10 ?? null;
}

export async function getOpenAqStation(lat, lon, fetcher = fetch) {
  const apiKey = String(process.env.OPENAQ_API_KEY || '').trim();
  if (!apiKey) return null;
  try {
    const headers = { accept: 'application/json', 'X-API-Key': apiKey };
    const locUrl = `${OPENAQ_URL}/locations?coordinates=${lat},${lon}&radius=25000&parameters_id=2&limit=100`;
    const locRes = await fetcher(locUrl, { signal: AbortSignal.timeout(6500), headers });
    if (!locRes?.ok) return null;
    const locData = await locRes.json().catch(() => null);
    const results = Array.isArray(locData?.results) ? locData.results : [];
    const cutoffMs = Date.now() - 48 * 3600_000;
    const bucketMs = 45 * 60_000;
    const candidates = results
      .filter(item => {
        if (!Number.isFinite(item?.id) || !Array.isArray(item.sensors) || !item.sensors.length) return false;
        const lastUtc = item.datetimeLast?.utc;
        if (lastUtc && Number.isFinite(Date.parse(lastUtc)) && Date.parse(lastUtc) < cutoffMs) return false;
        return true;
      })
      .sort((a, b) => {
        const aHasPm = a.sensors.some(s => /^pm(25|10)$/i.test(String(s.parameter?.name || ''))) ? 1 : 0;
        const bHasPm = b.sensors.some(s => /^pm(25|10)$/i.test(String(s.parameter?.name || ''))) ? 1 : 0;
        if (aHasPm !== bHasPm) return bHasPm - aHasPm;
        const aBucket = Math.floor((Date.parse(a.datetimeLast?.utc || '') || 0) / bucketMs);
        const bBucket = Math.floor((Date.parse(b.datetimeLast?.utc || '') || 0) / bucketMs);
        if (aBucket !== bBucket) return bBucket - aBucket;
        const aDist = Number.isFinite(a.distance) ? a.distance : 999999;
        const bDist = Number.isFinite(b.distance) ? b.distance : 999999;
        if (Math.abs(aDist - bDist) > 1000) return aDist - bDist;
        const aRef = (a.isMonitor || /CPCB|AirNow|EPA|DEFRA/i.test(String(a.provider?.name || ''))) ? 1 : 0;
        const bRef = (b.isMonitor || /CPCB|AirNow|EPA|DEFRA/i.test(String(b.provider?.name || ''))) ? 1 : 0;
        return bRef - aRef;
      });

    const topStations = candidates.slice(0, 3);
    const latestPayloads = await Promise.all(topStations.map(async station => {
      try {
        const latestUrl = `${OPENAQ_URL}/locations/${encodeURIComponent(String(station.id))}/latest`;
        const latestRes = await fetcher(latestUrl, { signal: AbortSignal.timeout(6500), headers });
        if (!latestRes?.ok) return null;
        const latestData = await latestRes.json().catch(() => null);
        return { station, measurements: Array.isArray(latestData?.results) ? latestData.results : [] };
      } catch {
        return null;
      }
    }));

    let primaryStation = null;
    const mergedReadings = {};
    let latestTime = null;

    for (const item of latestPayloads) {
      if (!item || !item.measurements.length) continue;
      const { station, measurements } = item;
      const sensorMap = new Map(station.sensors.map(s => [s.id, s.parameter]));
      const stationReadings = {};
      for (const m of measurements) {
        const param = sensorMap.get(m.sensorsId);
        const val = numberOrNull(m.value);
        if (!param?.name || val === null || val < 0) continue;
        const dt = m.datetime?.utc || m.datetime?.local || null;
        const dtMs = dt ? Date.parse(dt) : NaN;
        if (Number.isFinite(dtMs) && dtMs < cutoffMs) continue;
        const key = String(param.name).toLowerCase();
        const prevMs = stationReadings[key]?.time ? Date.parse(stationReadings[key].time) : -Infinity;
        if (!stationReadings[key] || (Number.isFinite(dtMs) && dtMs >= prevMs)) {
          stationReadings[key] = { value: Math.round(val * 10) / 10, unit: String(param.units || 'µg/m³'), time: dt };
        }
        if (dt && (!latestTime || Date.parse(dt) > Date.parse(latestTime))) latestTime = dt;
      }
      const hasPrimary = ['pm25', 'pm10', 'no2', 'o3', 'so2', 'co'].some(k => stationReadings[k]) || Object.keys(stationReadings).length > 0;
      if (!hasPrimary) continue;
      if (!primaryStation) primaryStation = station;
      for (const [k, v] of Object.entries(stationReadings)) {
        if (!mergedReadings[k]) mergedReadings[k] = v;
      }
    }

    if (!primaryStation) return null;
    const primaryKey = ['pm25', 'pm10', 'no2', 'o3', 'so2', 'co'].find(k => mergedReadings[k]) || Object.keys(mergedReadings)[0];
    if (!primaryKey) return null;

    const computedAqi = computeUsAqi(mergedReadings.pm25?.value, mergedReadings.pm10?.value);
    const providerName = primaryStation.provider?.name ? String(primaryStation.provider.name).slice(0, 60) : 'OpenAQ Network';
    return {
      stationName: String(primaryStation.name || primaryStation.locality || 'OpenAQ Ground Station').slice(0, 140),
      provider: providerName,
      aqi: computedAqi,
      primaryValue: mergedReadings[primaryKey].value,
      primaryUnit: mergedReadings[primaryKey].unit,
      dominantPollutant: primaryKey,
      readings: mergedReadings,
      time: mergedReadings[primaryKey].time || latestTime,
      source: `OpenAQ v3 (${providerName})`,
      sourceType: 'observed',
      url: `https://explore.openaq.org/locations/${primaryStation.id}`
    };
  } catch {
    return null;
  }
}

export async function getObservedStation(lat, lon, fetcher = fetch) {
  const openAq = await getOpenAqStation(lat, lon, fetcher);
  if (openAq) return openAq;
  const token = String(process.env.WAQI_API_TOKEN || '').trim();
  if (!token) return null;
  try {
    const url = `${WAQI_URL}${lat};${lon}/?token=${encodeURIComponent(token)}`;
    const response = await fetcher(url, { signal: AbortSignal.timeout(6000), headers: { accept: 'application/json' } });
    if (!response?.ok) return null;
    const payload = await response.json().catch(() => null);
    if (!payload || payload.status !== 'ok' || !payload.data) return null;
    const rawAqi = payload.data.aqi;
    if (rawAqi === null || rawAqi === undefined || String(rawAqi).trim() === '') return null;
    const aqi = Number(rawAqi);
    if (!Number.isFinite(aqi) || aqi < 0) return null;
    const stationName = String(payload.data.city?.name || 'Ground monitoring station').slice(0, 140);
    const dominantRaw = payload.data.dominentpol ?? payload.data.dominantpol ?? null;
    const dominantPollutant = dominantRaw ? String(dominantRaw).slice(0, 30) : null;
    const time = payload.data.time?.iso || payload.data.time?.s || null;
    const rawUrl = payload.data.city?.url;
    const stationUrl = typeof rawUrl === 'string' && /^https?:\/\//i.test(rawUrl) ? rawUrl : null;
    return {
      stationName,
      aqi,
      dominantPollutant,
      time,
      source: 'WAQI Ground Station',
      sourceType: 'observed',
      url: stationUrl
    };
  } catch {
    return null;
  }
}
export function normalizeAir(data, coords, now = Date.now()) {
  const c = data?.current ?? {};
  const h = data?.hourly ?? {};
  const times = Array.isArray(h.time) ? h.time : [];
  const forecast = times.map((time, index) => ({
    time: normalizeIsoMinute(time),
    aqi: numberOrNull(h.us_aqi?.[index]),
    pm25: numberOrNull(h.pm2_5?.[index]),
    pm10: numberOrNull(h.pm10?.[index])
  })).filter(point => point.time && Date.parse(point.time) >= now - 3600_000 && Date.parse(point.time) <= now + 30 * 3600_000).slice(0, 30);
  const time = normalizeIsoMinute(c.time);
  // A current-model timestamp is required: do not present stale or future data as current.
  const current = {
    aqi: numberOrNull(c.us_aqi),
    pm25: numberOrNull(c.pm2_5),
    pm10: numberOrNull(c.pm10),
    no2: numberOrNull(c.nitrogen_dioxide),
    o3: numberOrNull(c.ozone),
    so2: numberOrNull(c.sulphur_dioxide),
    co: numberOrNull(c.carbon_monoxide),
    time
  };
  if (current.aqi === null && current.pm25 === null && current.pm10 === null) {
    throw new Error('No usable air-quality reading is available for this location.');
  }
  const observationTime = time === null ? NaN : Date.parse(time);
  if (!Number.isFinite(observationTime) || observationTime < now - 3 * 3600_000 || observationTime > now + 2 * 3600_000) {
    throw new Error('Air-quality data are missing a recent model timestamp. Please check an official local source.');
  }
  return {
    source: 'Open-Meteo / Copernicus CAMS',
    sourceType: 'model',
    index: 'US AQI',
    disclosure: 'Modelled regional conditions, not a local ground-sensor reading or Indian CPCB AQI. Actual street-level exposure may differ.',
    coordinates: { latitude: coords.lat, longitude: coords.lon },
    retrievedAt: new Date(now).toISOString(),
    current,
    forecast,
    weather: null,
    observedStation: null
  };
}
export async function getAir(rawLat, rawLon, fetcher = fetch) {
  const coords = validateCoordinates(rawLat, rawLon);
  // City-level precision only: no household GPS coordinates required.
  const lat = Math.round(coords.lat * 100) / 100;
  const lon = Math.round(coords.lon * 100) / 100;
  const hasOpenAq = Boolean(String(process.env.OPENAQ_API_KEY || '').trim());
  const hasWaqi = Boolean(String(process.env.WAQI_API_TOKEN || '').trim());
  const obsTag = hasOpenAq ? 'openaq' : hasWaqi ? 'waqi' : 'model';
  return cachedFor(fetcher, `air:${lat}:${lon}:${obsTag}`, 20 * 60_000, async () => {
    const url = new URL(AIR_URL);
    url.searchParams.set('latitude', String(lat));
    url.searchParams.set('longitude', String(lon));
    url.searchParams.set('current', 'us_aqi,pm2_5,pm10,nitrogen_dioxide,ozone,sulphur_dioxide,carbon_monoxide');
    url.searchParams.set('hourly', 'us_aqi,pm2_5,pm10');
    url.searchParams.set('forecast_hours', '30');
    url.searchParams.set('timezone', 'GMT');
    const [data, weather, observedStation] = await Promise.all([
      requestJson(url.toString(), fetcher),
      fetchWeather(lat, lon, fetcher),
      getObservedStation(lat, lon, fetcher)
    ]);
    const air = normalizeAir(data, { lat, lon });
    if (fetcher === fetch) {
      if (observedStation && Number.isFinite(observedStation.aqi)) {
        air.current.aqi = observedStation.aqi;
        if (Number.isFinite(observedStation.readings?.pm25?.value)) {
          air.current.pm25 = observedStation.readings.pm25.value;
        }
        if (Number.isFinite(observedStation.readings?.pm10?.value)) {
          air.current.pm10 = observedStation.readings.pm10.value;
        }
      } else {
        const instantAqi = computeUsAqi(air.current.pm25, air.current.pm10);
        if (instantAqi !== null) air.current.aqi = instantAqi;
      }
    }
    return { ...air, weather, observedStation };
  });
}
export const PULSE_CITIES = Object.freeze([
  Object.freeze({ id: 'delhi', name: 'Delhi', region: 'Delhi', country: 'India', timezone: 'Asia/Kolkata', latitude: 28.61, longitude: 77.21 }),
  Object.freeze({ id: 'mumbai', name: 'Mumbai', region: 'Maharashtra', country: 'India', timezone: 'Asia/Kolkata', latitude: 19.08, longitude: 72.88 }),
  Object.freeze({ id: 'bengaluru', name: 'Bengaluru', region: 'Karnataka', country: 'India', timezone: 'Asia/Kolkata', latitude: 12.97, longitude: 77.59 }),
  Object.freeze({ id: 'kolkata', name: 'Kolkata', region: 'West Bengal', country: 'India', timezone: 'Asia/Kolkata', latitude: 22.57, longitude: 88.36 })
]);
export async function getLiveCityPulse(fetcher = fetch) {
  return cachedFor(fetcher, 'pulse:cities', 10 * 60_000, async () => {
    const cities = await Promise.all(PULSE_CITIES.map(async city => {
      try {
        const airUrl = new URL(AIR_URL);
        airUrl.searchParams.set('latitude', String(city.latitude));
        airUrl.searchParams.set('longitude', String(city.longitude));
        airUrl.searchParams.set('current', 'us_aqi,pm2_5');
        airUrl.searchParams.set('timezone', 'GMT');

        const weatherUrl = new URL(WEATHER_URL);
        weatherUrl.searchParams.set('latitude', String(city.latitude));
        weatherUrl.searchParams.set('longitude', String(city.longitude));
        weatherUrl.searchParams.set('current', 'wind_speed_10m,temperature_2m');
        weatherUrl.searchParams.set('timezone', 'GMT');

        const [airData, weatherData, observed] = await Promise.all([
          requestJson(airUrl.toString(), fetcher),
          requestJson(weatherUrl.toString(), fetcher).catch(() => null),
          fetcher === fetch ? getOpenAqStation(city.latitude, city.longitude, fetcher).catch(() => null) : Promise.resolve(null)
        ]);
        const c = airData?.current ?? {};
        let aqi = numberOrNull(c.us_aqi);
        let pm25 = numberOrNull(c.pm2_5);
        const time = normalizeIsoMinute(c.time);
        if (fetcher === fetch) {
          if (observed && Number.isFinite(observed.aqi)) {
            aqi = observed.aqi;
            if (Number.isFinite(observed.readings?.pm25?.value)) {
              pm25 = observed.readings.pm25.value;
            }
          } else {
            const instant = computeUsAqi(pm25, null);
            if (instant !== null) aqi = instant;
          }
        }
        if (aqi === null) throw new Error('Unavailable');
        const cat = categoryForUsAqi(aqi);
        const windRaw = numberOrNull(weatherData?.current?.wind_speed_10m);
        const windSpeed = windRaw === null ? null : Math.round(windRaw * 10) / 10;
        const tempRaw = finiteOrNull(weatherData?.current?.temperature_2m);
        const temperatureC = tempRaw === null ? null : Math.round(tempRaw * 10) / 10;
        return {
          ...city,
          aqi,
          pm25,
          windSpeed,
          temperatureC,
          category: cat.name,
          tone: cat.tone,
          time,
          index: 'US AQI',
          sourceType: 'model',
          source: 'Open-Meteo / Copernicus CAMS'
        };
      } catch {
        return {
          ...city,
          aqi: null,
          pm25: null,
          windSpeed: null,
          category: 'Unavailable',
          tone: 'unknown',
          time: null,
          index: 'US AQI',
          sourceType: 'model',
          source: 'Open-Meteo / Copernicus CAMS',
          error: 'Temporarily unavailable'
        };
      }
    }));
    return {
      cities,
      retrievedAt: new Date().toISOString(),
      index: 'US AQI',
      sourceType: 'model',
      source: 'Open-Meteo / Copernicus CAMS',
      disclosure: 'Modelled regional conditions (US AQI), not local ground-sensor readings or Indian CPCB AQI.'
    };
  });
}
export const DEMO_SCENARIOS = Object.freeze([
  { id:'unhealthy', label:'Unhealthy sample (US AQI 183)' },
  { id:'hazardous', label:'Hazardous sample (US AQI 355)' },
  { id:'moderate', label:'Moderate sample (US AQI 77)' },
  { id:'unavailable', label:'Missing data sample' }
]);
export function getSimulatedAir(now = Date.now(), scenario = 'unhealthy') {
  if (!DEMO_SCENARIOS.some(x=>x.id===scenario)) throw new Error('Unknown synthetic scenario.');
  const anchor = Math.floor(now / 3600_000) * 3600_000;
  const base = scenario === 'hazardous' ? 355 : scenario === 'moderate' ? 77 : 183;
  const unavailable = scenario === 'unavailable';
  const forecast = Array.from({ length: 30 }, (_, i) => {
    const variation = Math.round(29 * Math.cos(i * 0.48) + 18 * Math.sin(i * 0.2));
    const aqi = unavailable ? null : Math.max(1, base - 13 + variation);
    return {
      time: new Date(anchor + i * 3600_000).toISOString(),
      aqi,
      pm25: aqi === null ? null : Math.round((aqi * 0.44) * 10) / 10,
      pm10: aqi === null ? null : Math.round(aqi * 0.72)
    };
  });
  const syntheticWeather = unavailable ? null : scenario === 'hazardous'
    ? { temperatureC: 16.4, humidityPct: 74, windSpeedKmh: 4.2, pressureHpa: 1016, dispersionNote: dispersionNoteForWind(4.2), source: 'Synthetic sample meteorology' }
    : scenario === 'moderate'
      ? { temperatureC: 26.2, humidityPct: 48, windSpeedKmh: 15.4, pressureHpa: 1010, dispersionNote: dispersionNoteForWind(15.4), source: 'Synthetic sample meteorology' }
      : { temperatureC: 22.8, humidityPct: 61, windSpeedKmh: 6.5, pressureHpa: 1013, dispersionNote: dispersionNoteForWind(6.5), source: 'Synthetic sample meteorology' };
  return {
    source: `Synthetic sample (${scenario})`, sourceType: 'simulation', scenario, index: 'US AQI',
    disclosure: 'DEMO ONLY — generated sample values, not actual air-quality observations or forecasts. Do not use for health decisions.',
    coordinates: null, retrievedAt: new Date(now).toISOString(),
    current: {
      aqi: unavailable ? null : base,
      pm25: unavailable ? null : Math.round(base * 0.44 * 10) / 10,
      pm10: unavailable ? null : Math.round(base * 0.72),
      no2: unavailable ? null : Math.round(base * 0.25 * 10) / 10,
      o3: unavailable ? null : Math.round((45 + base * 0.14) * 10) / 10,
      so2: unavailable ? null : Math.round(base * 0.08 * 10) / 10,
      co: unavailable ? null : Math.round(base * 4.2),
      time: new Date(now).toISOString()
    },
    forecast: unavailable ? [] : forecast,
    weather: syntheticWeather,
    observedStation: null
  };
}
