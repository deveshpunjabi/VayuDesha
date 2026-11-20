/**
 * Pure environmental math, EPA US AQI breakpoint conversions, coordinate validation,
 * surface meteorology normalization, CAMS payload normalization, and synthetic scenario generation.
 */

export const PM25_US_AQI_BREAKPOINTS = Object.freeze([
  Object.freeze([0.0, 9.0, 0, 50]),
  Object.freeze([9.1, 35.4, 51, 100]),
  Object.freeze([35.5, 55.4, 101, 150]),
  Object.freeze([55.5, 125.4, 151, 200]),
  Object.freeze([125.5, 225.4, 201, 300]),
  Object.freeze([225.5, 325.4, 301, 400]),
  Object.freeze([325.5, 500.4, 401, 500])
]);

export const PM10_US_AQI_BREAKPOINTS = Object.freeze([
  Object.freeze([0, 54, 0, 50]),
  Object.freeze([55, 154, 51, 100]),
  Object.freeze([155, 254, 101, 150]),
  Object.freeze([255, 354, 151, 200]),
  Object.freeze([355, 424, 201, 300]),
  Object.freeze([425, 604, 301, 500])
]);

export const MAX_US_AQI = 500;
export const LIGHT_WIND_KMH = 8;
export const MODERATE_WIND_KMH = 18;
export const HOUR_MS = 3600_000;

export const PULSE_CITIES = Object.freeze([
  Object.freeze({ id: 'delhi', name: 'Delhi', region: 'Delhi', country: 'India', timezone: 'Asia/Kolkata', latitude: 28.61, longitude: 77.21 }),
  Object.freeze({ id: 'mumbai', name: 'Mumbai', region: 'Maharashtra', country: 'India', timezone: 'Asia/Kolkata', latitude: 19.08, longitude: 72.88 }),
  Object.freeze({ id: 'bengaluru', name: 'Bengaluru', region: 'Karnataka', country: 'India', timezone: 'Asia/Kolkata', latitude: 12.97, longitude: 77.59 }),
  Object.freeze({ id: 'kolkata', name: 'Kolkata', region: 'West Bengal', country: 'India', timezone: 'Asia/Kolkata', latitude: 22.57, longitude: 88.36 })
]);

/**
 * Returns a non-negative finite number or null.
 * @param {unknown} value
 * @returns {number|null}
 */
export function numberOrNull(value) {
  return Number.isFinite(value) && value >= 0 ? Number(value) : null;
}

/**
 * Returns any finite number (including negative temperatures) or null.
 * @param {unknown} value
 * @returns {number|null}
 */
export function finiteOrNull(value) {
  return Number.isFinite(value) ? Number(value) : null;
}

/**
 * Normalizes an Open-Meteo ISO minute timestamp (`YYYY-MM-DDTHH:mm`) to UTC ISO format.
 * @param {unknown} value
 * @returns {string|null}
 */
export function normalizeIsoMinute(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d\d:\d\d$/.test(value) ? `${value}Z` : null;
}

/**
 * Validates raw latitude and longitude values within geographic bounds.
 * @param {unknown} latRaw
 * @param {unknown} lonRaw
 * @returns {{ lat: number, lon: number }}
 */
export function validateCoordinates(latRaw, lonRaw) {
  if (latRaw == null || lonRaw == null || String(latRaw).trim() === '' || String(lonRaw).trim() === '') {
    throw new Error('City coordinates are required.');
  }
  const lat = Number(latRaw);
  const lon = Number(lonRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    throw new Error('Invalid latitude or longitude.');
  }
  return { lat, lon };
}

/**
 * Converts a PM2.5 concentration (µg/m³) to the US EPA AQI scale.
 * @param {number|null|undefined} pm25
 * @returns {number|null}
 */
export function pm25ToUsAqi(pm25) {
  if (!Number.isFinite(pm25) || pm25 < 0) return null;
  const truncated = Math.floor(pm25 * 10) / 10;
  for (const [cLo, cHi, iLo, iHi] of PM25_US_AQI_BREAKPOINTS) {
    if (truncated <= cHi) return Math.round(((iHi - iLo) / (cHi - cLo)) * (truncated - cLo) + iLo);
  }
  return MAX_US_AQI;
}

/**
 * Converts a PM10 concentration (µg/m³) to the US EPA AQI scale.
 * @param {number|null|undefined} pm10
 * @returns {number|null}
 */
export function pm10ToUsAqi(pm10) {
  if (!Number.isFinite(pm10) || pm10 < 0) return null;
  const truncated = Math.floor(pm10);
  for (const [cLo, cHi, iLo, iHi] of PM10_US_AQI_BREAKPOINTS) {
    if (truncated <= cHi) return Math.round(((iHi - iLo) / (cHi - cLo)) * (truncated - cLo) + iLo);
  }
  return MAX_US_AQI;
}

/**
 * Computes overall instantaneous US AQI from PM2.5 and PM10 concentrations.
 * @param {number|null|undefined} pm25
 * @param {number|null|undefined} pm10
 * @returns {number|null}
 */
export function computeUsAqi(pm25, pm10) {
  const a25 = pm25ToUsAqi(pm25);
  const a10 = pm10ToUsAqi(pm10);
  if (a25 !== null && a10 !== null) return Math.max(a25, a10);
  return a25 ?? a10 ?? null;
}

/**
 * Generates a factual atmospheric dispersion description for a 10m wind speed (km/h).
 * @param {number|null|undefined} windSpeedKmh
 * @returns {string}
 */
export function dispersionNoteForWind(windSpeedKmh) {
  if (!Number.isFinite(windSpeedKmh) || windSpeedKmh < 0) {
    return 'Surface wind speed is unavailable; local dispersion cannot be characterized.';
  }
  if (windSpeedKmh < LIGHT_WIND_KMH) return 'Light winds can slow dispersion of urban smoke and particulate matter.';
  if (windSpeedKmh <= MODERATE_WIND_KMH) return 'Moderate surface wind aids partial dispersion.';
  return 'Stronger surface wind supports faster dispersion of local emissions.';
}

/**
 * Normalizes raw Open-Meteo surface weather payload.
 * @param {Record<string, any>|null|undefined} data
 * @returns {Record<string, any>|null}
 */
export function normalizeWeather(data) {
  const c = data?.current;
  if (!c || typeof c !== 'object') return null;
  const temperatureRaw = finiteOrNull(c.temperature_2m);
  const humidityRaw = numberOrNull(c.relative_humidity_2m);
  const windRaw = numberOrNull(c.wind_speed_10m);
  const pressureRaw = numberOrNull(c.surface_pressure);
  if (temperatureRaw === null && humidityRaw === null && windRaw === null && pressureRaw === null) return null;
  const windSpeedKmh = windRaw === null ? null : Math.round(windRaw * 10) / 10;
  return {
    temperatureC: temperatureRaw === null ? null : Math.round(temperatureRaw * 10) / 10,
    humidityPct: humidityRaw === null ? null : Math.round(humidityRaw),
    windSpeedKmh,
    pressureHpa: pressureRaw === null ? null : Math.round(pressureRaw),
    dispersionNote: dispersionNoteForWind(windSpeedKmh),
    source: 'Open-Meteo Weather'
  };
}

/**
 * Normalizes raw Open-Meteo / Copernicus CAMS air-quality payload with timestamp validation.
 * @param {Record<string, any>} data
 * @param {{ lat: number, lon: number }} coords
 * @param {number} [now=Date.now()]
 * @returns {Record<string, any>}
 */
export function normalizeAir(data, coords, now = Date.now()) {
  const c = data?.current ?? {};
  const h = data?.hourly ?? {};
  const times = Array.isArray(h.time) ? h.time : [];
  const forecast = times.map((time, index) => ({
    time: normalizeIsoMinute(time),
    aqi: numberOrNull(h.us_aqi?.[index]),
    pm25: numberOrNull(h.pm2_5?.[index]),
    pm10: numberOrNull(h.pm10?.[index])
  })).filter(p => p.time && Date.parse(p.time) >= now - HOUR_MS && Date.parse(p.time) <= now + 30 * HOUR_MS).slice(0, 30);
  const time = normalizeIsoMinute(c.time);
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
  if (!Number.isFinite(observationTime) || observationTime < now - 3 * HOUR_MS || observationTime > now + 2 * HOUR_MS) {
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

export const DEMO_SCENARIOS = Object.freeze([
  Object.freeze({ id: 'unhealthy', label: 'Unhealthy sample (US AQI 183)' }),
  Object.freeze({ id: 'hazardous', label: 'Hazardous sample (US AQI 355)' }),
  Object.freeze({ id: 'moderate', label: 'Moderate sample (US AQI 77)' }),
  Object.freeze({ id: 'unavailable', label: 'Missing data sample' })
]);

const SYNTHETIC_WEATHER = Object.freeze({
  hazardous: Object.freeze({ temperatureC: 16.4, humidityPct: 74, windSpeedKmh: 4.2, pressureHpa: 1016 }),
  moderate: Object.freeze({ temperatureC: 26.2, humidityPct: 48, windSpeedKmh: 15.4, pressureHpa: 1010 }),
  unhealthy: Object.freeze({ temperatureC: 22.8, humidityPct: 61, windSpeedKmh: 6.5, pressureHpa: 1013 })
});

/**
 * Generates deterministic synthetic air-quality telemetry for offline testing and demos.
 * @param {number} [now=Date.now()]
 * @param {string} [scenario='unhealthy']
 * @returns {Record<string, any>}
 */
export function getSimulatedAir(now = Date.now(), scenario = 'unhealthy') {
  if (!DEMO_SCENARIOS.some(x => x.id === scenario)) throw new Error('Unknown synthetic scenario.');
  const anchor = Math.floor(now / HOUR_MS) * HOUR_MS;
  const base = scenario === 'hazardous' ? 355 : scenario === 'moderate' ? 77 : 183;
  const unavailable = scenario === 'unavailable';
  const forecast = unavailable ? [] : Array.from({ length: 30 }, (_, i) => {
    const aqi = Math.max(1, base - 13 + Math.round(29 * Math.cos(i * 0.48) + 18 * Math.sin(i * 0.2)));
    return { time: new Date(anchor + i * HOUR_MS).toISOString(), aqi, pm25: Math.round(aqi * 0.44 * 10) / 10, pm10: Math.round(aqi * 0.72) };
  });
  const preset = SYNTHETIC_WEATHER[scenario] || SYNTHETIC_WEATHER.unhealthy;
  return {
    source: `Synthetic sample (${scenario})`, sourceType: 'simulation', scenario, index: 'US AQI',
    disclosure: 'DEMO ONLY — generated sample values, not actual air-quality observations or forecasts. Do not use for health decisions.',
    coordinates: null, retrievedAt: new Date(now).toISOString(),
    current: {
      aqi: unavailable ? null : base, pm25: unavailable ? null : Math.round(base * 0.44 * 10) / 10,
      pm10: unavailable ? null : Math.round(base * 0.72), no2: unavailable ? null : Math.round(base * 0.25 * 10) / 10,
      o3: unavailable ? null : Math.round((45 + base * 0.14) * 10) / 10, so2: unavailable ? null : Math.round(base * 0.08 * 10) / 10,
      co: unavailable ? null : Math.round(base * 4.2), time: new Date(now).toISOString()
    },
    forecast,
    weather: unavailable ? null : { ...preset, dispersionNote: dispersionNoteForWind(preset.windSpeedKmh), source: 'Synthetic sample meteorology' },
    observedStation: null
  };
}
