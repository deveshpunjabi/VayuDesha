import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import {
  normalizeAir,
  normalizeWeather,
  dispersionNoteForWind,
  getAir,
  getOpenAqStation,
  getObservedStation,
  getLiveCityPulse,
  getSimulatedAir,
  PULSE_CITIES
} from '../server/air.mjs';
import { activeAiProvider, getAssistantReply } from '../server/ai.mjs';
import { startServer } from '../server/index.mjs';

async function withEnv(overrides, fn) {
  const previous = {};
  for (const [key, value] of Object.entries(overrides)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function recentIsoMinute(now = Date.now()) {
  return new Date(Math.floor(now / 3600_000) * 3600_000).toISOString().slice(0, 16);
}

test('Multi-pollutant normalization extracts all six pollutants and hourly PM10 while preserving model provenance', () => {
  const now = Date.parse('2026-11-19T12:15:00Z');
  const raw = {
    current: {
      us_aqi: 174,
      pm2_5: 86.4,
      pm10: 142.8,
      nitrogen_dioxide: 48.2,
      ozone: 61.5,
      sulphur_dioxide: 14.7,
      carbon_monoxide: 710,
      time: '2026-11-19T12:00'
    },
    hourly: {
      time: ['2026-11-19T12:00', '2026-11-19T13:00'],
      us_aqi: [174, 158],
      pm2_5: [86.4, 71.2],
      pm10: [142.8, 121.0]
    }
  };
  const air = normalizeAir(raw, { lat: 28.61, lon: 77.21 }, now);
  assert.equal(air.index, 'US AQI');
  assert.equal(air.sourceType, 'model');
  assert.equal(air.source, 'Open-Meteo / Copernicus CAMS');
  assert.match(air.disclosure, /not.*Indian CPCB AQI/i);
  assert.deepEqual(
    {
      aqi: air.current.aqi,
      pm25: air.current.pm25,
      pm10: air.current.pm10,
      no2: air.current.no2,
      o3: air.current.o3,
      so2: air.current.so2,
      co: air.current.co
    },
    { aqi: 174, pm25: 86.4, pm10: 142.8, no2: 48.2, o3: 61.5, so2: 14.7, co: 710 }
  );
  assert.equal(air.forecast.length, 2);
  assert.equal(air.forecast[1].pm10, 121.0);
  assert.equal(air.weather, null);
  assert.equal(air.observedStation, null);
});

test('Weather normalization produces factual dispersion notes and getAir degrades gracefully when weather fails', async () => {
  const calm = normalizeWeather({
    current: { temperature_2m: 18.44, relative_humidity_2m: 72.4, wind_speed_10m: 5.24, surface_pressure: 1015.6 }
  });
  assert.equal(calm.temperatureC, 18.4);
  assert.equal(calm.humidityPct, 72);
  assert.equal(calm.windSpeedKmh, 5.2);
  assert.equal(calm.pressureHpa, 1016);
  assert.equal(calm.source, 'Open-Meteo Weather');
  assert.match(calm.dispersionNote, /Light winds/i);
  assert.match(dispersionNoteForWind(12), /Moderate surface wind/i);
  assert.match(dispersionNoteForWind(24), /Stronger surface wind/i);
  assert.equal(normalizeWeather({ current: {} }), null);

  await withEnv({ WAQI_API_TOKEN: undefined }, async () => {
    const t = recentIsoMinute();
    const mockFetcher = async url => {
      if (url.includes('air-quality-api.open-meteo.com')) {
        return {
          ok: true,
          json: async () => ({
            current: { us_aqi: 152, pm2_5: 62.5, pm10: 110, nitrogen_dioxide: 31, ozone: 54, sulphur_dioxide: 9, carbon_monoxide: 520, time: t },
            hourly: { time: [t], us_aqi: [152], pm2_5: [62.5], pm10: [110] }
          })
        };
      }
      if (url.includes('api.open-meteo.com/v1/forecast')) {
        throw new Error('simulated weather provider outage');
      }
      throw new Error(`Unexpected URL: ${url}`);
    };
    const air = await getAir(28.6139, 77.2090, mockFetcher);
    assert.equal(air.current.aqi, 152);
    assert.equal(air.current.no2, 31);
    assert.equal(air.weather, null);
    assert.equal(air.observedStation, null);
    assert.equal(air.sourceType, 'model');
  });
});

test('Simulated air includes clearly synthetic multi-pollutants and weather while keeping unavailable weather null', () => {
  const unhealthy = getSimulatedAir(Date.now(), 'unhealthy');
  assert.equal(unhealthy.sourceType, 'simulation');
  assert.equal(unhealthy.current.aqi, 183);
  assert.equal(typeof unhealthy.current.no2, 'number');
  assert.equal(typeof unhealthy.current.o3, 'number');
  assert.equal(typeof unhealthy.current.so2, 'number');
  assert.equal(typeof unhealthy.current.co, 'number');
  assert.match(unhealthy.weather.source, /Synthetic/i);
  assert.equal(unhealthy.observedStation, null);

  const unavailable = getSimulatedAir(Date.now(), 'unavailable');
  assert.equal(unavailable.current.aqi, null);
  assert.equal(unavailable.current.no2, null);
  assert.equal(unavailable.weather, null);
  assert.equal(unavailable.observedStation, null);
});

test('Optional WAQI ground-station adapter returns sourceType observed without ever relabelling CAMS as CPCB/observed', async () => {
  await withEnv({ WAQI_API_TOKEN: undefined }, async () => {
    let called = false;
    const result = await getObservedStation(28.61, 77.21, async () => {
      called = true;
      return { ok: true, json: async () => ({ status: 'ok', data: { aqi: 210 } }) };
    });
    assert.equal(result, null);
    assert.equal(called, false);
  });

  await withEnv({ WAQI_API_TOKEN: 'mock-waqi-token' }, async () => {
    const t = recentIsoMinute();
    const mockFetcher = async url => {
      if (url.includes('api.waqi.info/feed/geo:')) {
        assert.match(url, /token=mock-waqi-token/);
        return {
          ok: true,
          json: async () => ({
            status: 'ok',
            data: {
              aqi: 238,
              dominentpol: 'pm25',
              city: { name: 'ITO, Delhi', url: 'https://aqicn.org/city/delhi/ito/' },
              time: { iso: '2026-11-19T12:00:00+05:30' }
            }
          })
        };
      }
      if (url.includes('air-quality-api.open-meteo.com')) {
        return {
          ok: true,
          json: async () => ({
            current: { us_aqi: 185, pm2_5: 98.1, pm10: 155, time: t },
            hourly: { time: [t], us_aqi: [185], pm2_5: [98.1], pm10: [155] }
          })
        };
      }
      if (url.includes('api.open-meteo.com/v1/forecast')) {
        return {
          ok: true,
          json: async () => ({
            current: { temperature_2m: 20.1, relative_humidity_2m: 62, wind_speed_10m: 6.4, surface_pressure: 1013 }
          })
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    const air = await getAir(28.61, 77.21, mockFetcher);
    // Primary CAMS model provenance must NEVER be relabelled as observed or CPCB
    assert.equal(air.sourceType, 'model');
    assert.equal(air.index, 'US AQI');
    assert.equal(air.source, 'Open-Meteo / Copernicus CAMS');
    assert.match(air.disclosure, /not.*Indian CPCB AQI/i);
    // Optional WAQI ground station stays clearly separated with sourceType === 'observed'
    assert.ok(air.observedStation);
    assert.equal(air.observedStation.sourceType, 'observed');
    assert.equal(air.observedStation.source, 'WAQI Ground Station');
    assert.equal(air.observedStation.stationName, 'ITO, Delhi');
    assert.equal(air.observedStation.aqi, 238);
    assert.equal(air.observedStation.dominantPollutant, 'pm25');
    assert.equal(air.observedStation.url, 'https://aqicn.org/city/delhi/ito/');
  });
});

test('getLiveCityPulse normalizes 4 Indian cities with model provenance and handles single-city outages gracefully', async () => {
  assert.equal(PULSE_CITIES.length, 4);
  const t = recentIsoMinute();
  const mockFetcher = async url => {
    const parsed = new URL(url);
    const lat = Number(parsed.searchParams.get('latitude'));
    if (url.includes('air-quality-api.open-meteo.com')) {
      if (Math.abs(lat - 22.57) < 0.1) throw new Error('Simulated Kolkata outage');
      const aqi = Math.abs(lat - 28.61) < 0.1 ? 215 : Math.abs(lat - 19.08) < 0.1 ? 112 : 68;
      return {
        ok: true,
        json: async () => ({ current: { us_aqi: aqi, pm2_5: Math.round(aqi * 0.45 * 10) / 10, time: t } })
      };
    }
    if (url.includes('api.open-meteo.com/v1/forecast')) {
      return {
        ok: true,
        json: async () => ({ current: { wind_speed_10m: 9.6, temperature_2m: 24.3 } })
      };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const pulse = await getLiveCityPulse(mockFetcher);
  assert.equal(pulse.index, 'US AQI');
  assert.equal(pulse.sourceType, 'model');
  assert.equal(pulse.source, 'Open-Meteo / Copernicus CAMS');
  assert.match(pulse.disclosure, /not.*Indian CPCB AQI/i);
  assert.equal(pulse.cities.length, 4);

  const delhi = pulse.cities.find(c => c.id === 'delhi');
  assert.equal(delhi.aqi, 215);
  assert.equal(delhi.category, 'Very unhealthy');
  assert.equal(delhi.windSpeed, 9.6);
  assert.equal(delhi.sourceType, 'model');
  assert.equal(delhi.index, 'US AQI');

  const kolkata = pulse.cities.find(c => c.id === 'kolkata');
  assert.equal(kolkata.aqi, null);
  assert.equal(kolkata.error, 'Temporarily unavailable');
  assert.equal(kolkata.sourceType, 'model');
});

test('Google Gemini structured-JSON provider selects approved actions, composes server-authored response, and falls back safely', async () => {
  await withEnv({ GEMINI_API_KEY: 'mock-gemini-key', OPENAI_API_KEY: undefined, AI_PROVIDER: undefined }, async () => {
    assert.equal(activeAiProvider(), 'gemini');

    let calledUrl = '';
    let sentHeaders = null;
    let sentPayload = null;
    const okFetcher = async (url, options) => {
      calledUrl = url;
      sentHeaders = options.headers;
      sentPayload = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({
          candidates: [{
            finishReason: 'STOP',
            content: { parts: [{ text: JSON.stringify({ status: 'supported', actionIds: ['children', 'outdoor'] }) }] }
          }]
        })
      };
    };

    const res = await getAssistantReply('Should my child play outside today?', getSimulatedAir(), { children: true }, 'Asia/Kolkata', okFetcher);
    assert.match(calledUrl, /generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-4-hydrogen:generateContent$/);
    assert.doesNotMatch(calledUrl, /key=/);
    assert.equal(sentHeaders['x-goog-api-key'], 'mock-gemini-key');
    assert.equal(sentPayload.generationConfig.responseMimeType, 'application/json');
    assert.equal(sentPayload.generationConfig.temperature, 0.2);
    assert.deepEqual(sentPayload.generationConfig.thinkingConfig, { thinkingBudget: 0 });
    assert.equal(sentPayload.generationConfig.responseSchema.type, 'OBJECT');
    assert.equal(res.mode, 'genai');
    assert.equal(res.provider, 'gemini');
    assert.equal(res.status, 'supported');
    assert.match(res.reply, /DEMO ONLY/);
    assert.match(res.reply, /Evidence:/);
    assert.deepEqual(res.evidence.map(e => e.id), ['children', 'outdoor']);

    // Transient 503 on primary Gemini model automatically fails over to fallback model
    const calledModels = [];
    const failoverRes = await getAssistantReply('Should my child play outside today?', getSimulatedAir(), { children: true }, 'Asia/Kolkata', async url => {
      calledModels.push(url);
      if (url.includes('gemini-4-hydrogen')) return { ok: false, status: 503, json: async () => ({ error: { code: 503 } }) };
      return {
        ok: true,
        json: async () => ({
          candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ status: 'supported', actionIds: ['outdoor'] }) }] } }]
        })
      };
    });
    assert.equal(calledModels.length, 2);
    assert.match(calledModels[0], /gemini-4-hydrogen:generateContent$/);
    assert.match(calledModels[1], /gemini-2\.5-flash:generateContent$/);
    assert.equal(failoverRes.mode, 'genai');
    assert.equal(failoverRes.provider, 'gemini');

    // Invalid JSON falls back safely to verified rules
    const badJson = await getAssistantReply('How should I commute today?', getSimulatedAir(), {}, 'UTC', async () => ({
      ok: true,
      json: async () => ({
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{not valid json' }] } }]
      })
    }));
    assert.equal(badJson.mode, 'fallback');
    assert.equal(badJson.provider, 'rules');
    assert.match(badJson.note, /Checked rules were used/i);

    // Invented action ID is rejected and falls back safely
    const invented = await getAssistantReply('Should I wear a mask while commuting?', getSimulatedAir(), {}, 'UTC', async () => ({
      ok: true,
      json: async () => ({
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ status: 'supported', actionIds: ['invented-medical-advice'] }) }] } }]
      })
    }));
    assert.equal(invented.mode, 'fallback');
    assert.equal(invented.provider, 'rules');
    assert.doesNotMatch(invented.reply, /invented-medical-advice/);
  });

  // Verify AI_PROVIDER=openai override when both keys exist, and OpenAI default when only OPENAI_API_KEY exists
  await withEnv({ GEMINI_API_KEY: 'mock-gemini', OPENAI_API_KEY: 'mock-openai', AI_PROVIDER: 'openai' }, async () => {
    assert.equal(activeAiProvider(), 'openai');
  });
  await withEnv({ GEMINI_API_KEY: undefined, OPENAI_API_KEY: 'mock-openai', AI_PROVIDER: undefined }, async () => {
    assert.equal(activeAiProvider(), 'openai');
  });
  await withEnv({ GEMINI_API_KEY: undefined, OPENAI_API_KEY: undefined, AI_PROVIDER: undefined }, async () => {
    assert.equal(activeAiProvider(), null);
  });
});

test('HTTP /api/health reports aiProvider and waqiEnabled without leaking secrets, /api/stream validates coordinates, and /api/pulse honors provenance contract', async t => {
  const server = startServer(0);
  await once(server, 'listening');
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;

  // /api/health without keys
  await withEnv({ GEMINI_API_KEY: undefined, OPENAI_API_KEY: undefined, OPENAQ_API_KEY: undefined, WAQI_API_TOKEN: undefined, AI_PROVIDER: undefined }, async () => {
    const res = await fetch(`${base}/api/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, { ok: true, aiEnabled: false, aiProvider: null, aiModel: null, openaqEnabled: false, waqiEnabled: false });
  });

  // /api/health with mocked keys must NEVER leak raw secrets
  await withEnv({ GEMINI_API_KEY: 'super-secret-gemini-xyz', OPENAQ_API_KEY: 'super-secret-openaq-xyz', WAQI_API_TOKEN: 'super-secret-waqi-xyz', OPENAI_API_KEY: undefined, AI_PROVIDER: undefined }, async () => {
    const res = await fetch(`${base}/api/health`);
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.doesNotMatch(text, /super-secret-gemini-xyz/);
    assert.doesNotMatch(text, /super-secret-openaq-xyz/);
    assert.doesNotMatch(text, /super-secret-waqi-xyz/);
    const body = JSON.parse(text);
    assert.deepEqual(body, { ok: true, aiEnabled: true, aiProvider: 'gemini', aiModel: 'gemini-4-hydrogen', openaqEnabled: true, waqiEnabled: true });
  });

  // /api/stream rejects invalid coordinates with 400
  for (const query of ['', '?lat=95&lon=77', '?lat=28.6&lon=200', '?lat=abc&lon=77', '?lat=%20&lon=77']) {
    const res = await fetch(`${base}/api/stream${query}`);
    assert.equal(res.status, 400, `Expected 400 for /api/stream${query}`);
    const body = await res.json();
    assert.ok(typeof body.error === 'string' && body.error.length > 0);
  }

  // /api/pulse returns 200 with provenance contract (works both online with live CAMS and offline with graceful Unavailable)
  const pulseRes = await fetch(`${base}/api/pulse`);
  assert.equal(pulseRes.status, 200);
  const pulse = await pulseRes.json();
  assert.equal(pulse.index, 'US AQI');
  assert.equal(pulse.sourceType, 'model');
  assert.equal(pulse.source, 'Open-Meteo / Copernicus CAMS');
  assert.match(pulse.disclosure, /not.*Indian CPCB AQI/i);
  assert.equal(Array.isArray(pulse.cities), true);
  assert.equal(pulse.cities.length, 4);
  for (const city of pulse.cities) {
    assert.equal(city.index, 'US AQI');
    assert.equal(city.sourceType, 'model');
    assert.ok(typeof city.name === 'string' && city.name.length > 0);
    assert.ok(city.aqi === null ? typeof city.error === 'string' : Number.isFinite(city.aqi));
  }

  // Verify hardened security headers including COOP, X-Permitted-Cross-Domain-Policies, and proxy HSTS
  const secRes = await fetch(`${base}/api/health`, { headers: { 'x-forwarded-proto': 'https' } });
  assert.equal(secRes.headers.get('cross-origin-opener-policy'), 'same-origin');
  assert.equal(secRes.headers.get('x-permitted-cross-domain-policies'), 'none');
  assert.match(secRes.headers.get('strict-transport-security'), /max-age=31536000/);
});

test('Concurrent getAir calls for the same city deduplicate upstream provider requests', async () => {
  await withEnv({ WAQI_API_TOKEN: undefined }, async () => {
    let aqCalls = 0;
    const t = recentIsoMinute();
    const mockFetcher = async url => {
      await new Promise(r => setTimeout(r, 25));
      if (url.includes('air-quality-api.open-meteo.com')) {
        aqCalls++;
        return {
          ok: true,
          json: async () => ({
            current: { us_aqi: 140, pm2_5: 55.2, pm10: 92, time: t },
            hourly: { time: [t], us_aqi: [140], pm2_5: [55.2], pm10: [92] }
          })
        };
      }
      if (url.includes('api.open-meteo.com/v1/forecast')) {
        return { ok: true, json: async () => ({ current: { temperature_2m: 22, relative_humidity_2m: 58, wind_speed_10m: 9.1, surface_pressure: 1012 } }) };
      }
      throw new Error(`Unexpected URL: ${url}`);
    };
    const [a, b, c] = await Promise.all([
      getAir(19.08, 72.88, mockFetcher),
      getAir(19.08, 72.88, mockFetcher),
      getAir(19.08, 72.88, mockFetcher)
    ]);
    assert.equal(aqCalls, 1);
    assert.equal(a.current.aqi, 140);
    assert.equal(b.current.aqi, 140);
    assert.equal(c.current.aqi, 140);
  });
});

test('OpenAQ v3 ground-station adapter sends X-API-Key header and returns observed station readings', async () => {
  await withEnv({ OPENAQ_API_KEY: 'mock-openaq-key', WAQI_API_TOKEN: undefined }, async () => {
    const mockFetcher = async (url, options) => {
      assert.equal(options.headers['X-API-Key'], 'mock-openaq-key');
      assert.doesNotMatch(url, /mock-openaq-key/);
      if (url.includes('/v3/locations?coordinates=28.61,77.21')) {
        return {
          ok: true,
          json: async () => ({
            results: [{
              id: 8118,
              name: 'New Delhi US Diplomatic Post',
              provider: { name: 'AirNow' },
              sensors: [{ id: 23534, parameter: { name: 'pm25', units: 'µg/m³' } }]
            }]
          })
        };
      }
      if (url.includes('/v3/locations/8118/latest')) {
        return {
          ok: true,
          json: async () => ({
            results: [{ sensorsId: 23534, value: 142.6, datetime: { utc: '2026-11-19T15:00:00Z' } }]
          })
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    };
    const obs = await getOpenAqStation(28.61, 77.21, mockFetcher);
    assert.ok(obs);
    assert.equal(obs.sourceType, 'observed');
    assert.equal(obs.stationName, 'New Delhi US Diplomatic Post');
    assert.equal(obs.primaryValue, 142.6);
    assert.equal(obs.primaryUnit, 'µg/m³');
    assert.equal(obs.dominantPollutant, 'pm25');
    assert.equal(obs.url, 'https://explore.openaq.org/locations/8118');
  });
});
