# VayuDesha — Urban Air Quality & Winter Smog Decision Assistant

**Live Production App:** https://vayudesha.vercel.app  
**Repository:** https://github.com/deveshpunjabi/VayuDesha  
**Tagline:** *Same air. Different lives. Better decisions.*

---

## 1. Project Overview & Problem Statement Alignment

**[Challenge 6] Urban Air Quality Assistant** — *Create a GenAI-powered assistant that helps families and communities navigate severe winter smog and urban air pollution. The application should suggest low-emission daily routines, indoor air quality hacks, and sustainable alternatives tailored to their location and lifestyle, while clearly explaining the direct impact of their choices.*

VayuDesha is engineered around five real-world urban personas: **parents & caregivers** (school and outdoor play decisions), **active commuters** (cyclists and walkers balancing low emissions against exertion inhalation dose), **fixed-shift workers** (whose departure hours cannot shift), **budget-constrained households** (fan-only or zero-budget homes), and **community organizers** (schools, resident associations, and workplaces sharing anonymous smog playbooks).

Rather than building a passive AQI dashboard or an unconstrained chatbot that invents medical claims, VayuDesha combines **dual-layer real-time atmospheric telemetry**, **deterministic scientific decision rules**, and **grounded Google Gemini 2.5 Flash synthesis**:

1. **Real-Time Multi-Pollutant, Ground-Station & Winter Smog Meteorology (`server/air.mjs`)**:
   - Ingests live **OpenAQ API v3** physical ground-monitor readings (`OPENAQ_API_KEY`, header-only `X-API-Key`, 45-minute freshness bucketing, reference-monitor prioritization for `CPCB`, `AirNow`, `EPA`, and multi-sensor deduplication) alongside **Open-Meteo / Copernicus CAMS** 30-hour forecasts for **US AQI** and 6 criteria pollutants (**PM2.5, PM10, NO₂, O₃, SO₂, CO**).
   - Computes instantaneous **US EPA AQI** (`pm25ToUsAqi`, `pm10ToUsAqi`, `computeUsAqi`) so city cards and dashboards reflect current hour particulate spikes rather than 24-hour lagging rolling averages, while keeping `model`, `observed`, and `simulation` provenance strictly separated.
   - Fetches parallel **Open-Meteo Surface Meteorology** (**10m wind speed, relative humidity, temperature, surface pressure**) to surface winter boundary-layer stagnation and dispersion context.
   - Automatically loads live telemetry for **Delhi, India** on initial visit so users and automated evaluators immediately inspect a populated dashboard.
2. **Household-Calibrated Routines, Indoor Air Hacks & Sustainable Alternatives (`server/decisions.mjs`, `server/routine.mjs`, `server/room.mjs`, `server/choices.mjs`, `server/compare.mjs`)**:
   - Normalizes 10 household constraints (`children`, `extraCare`, `commute`, `budget`, `home`, `flexibility`, `maxShiftMinutes`, `usualHour`, `outdoorHour`, `cookingHour`) with strict server-side bounds.
   - **3–6 Step Daily Routine Timeline:** Respects fixed schedules (`0 min`) and sub-hour flexibility (`15 min`) without fabricating minute-level departure shifts from hourly forecasts; only flexible schedules (`>= 60 min`) compute same-day daytime forecast PM2.5 differences (`deltaPm25`).
   - **Indoor Clean-Air Room Planner:** Implements the **US EPA Clean Air in Buildings Challenge** smoke CADR sizing formula (`smoke CADR in cfm >= 2/3 × room area in ft²`, converted to `m³/h`), pairs it with zero-cost source control (`cooking`, `incense`, `dust`, `mixed`), and distinguishes unfiltered room fans from HEPA filtration.
   - **Sustainable Alternatives & Direct Impact Explanations:** Evaluates exposure, emissions, cost, and direct impact across commute and errand swaps (metro/bus shared transit vs. solo car/two-wheeler, trip-chaining, afternoon boundary-layer dispersion windows) and pairs avoided `vehicle-km` with typical Indian urban fleet reference benchmarks (ARAI / CPCB context).
3. **Grounded Google Gemini 2.5 Flash Synthesis & Dual Domain Gateway (`server/ai.mjs`, `server/evidence.mjs`)**:
   - Uses **Google Gemini (`gemini-2.5-flash` primary with automatic `gemini-2.0-flash` failover)** via strict `responseSchema` (`{ status, actionIds, reply, directImpactSummary }`) and header-only `x-goog-api-key` authentication.
   - Gemini generates a tailored conversational explanation (`reply`) and a grounded choice-impact explanation (`directImpactSummary`) referencing live city US AQI, PM2.5, and wind speed while selecting **1–3 verified action IDs** from a frozen 11-entry scientific citation registry (WHO, US EPA AirNow, CPCB, CAQM, Copernicus CAMS).
   - **Pre-LLM & Post-LLM Safety Gateway:** Deterministically intercepts life-threatening respiratory emergencies, blocks code generation, image generation, math/homework, and off-topic prompts, and enforces 7 scientific/legal boundaries (medication adherence, official CAQM GRAP orders, CPCB vs. US AQI scales, personal disease-risk percentages, unverified CO₂ claims, street-level routing, and sub-hour forecast resolution).

---

## 2. System Architecture & Tech Stack

- **AI & Orchestration:** Built and audited with **Google Antigravity**; powered at runtime by the **Google Gemini API (`gemini-2.5-flash`)** with structured JSON schema output (`responseMimeType: "application/json"`, `thinkingBudget: 0`).
- **Environmental Data Providers:** **OpenAQ API v3** (live physical ground stations), **Open-Meteo Air Quality / Copernicus CAMS** (multi-pollutant 30h forecasts), **Open-Meteo Weather** (surface wind & dispersion), and **GeoNames Geocoding**.
- **Runtime & Deployment:** **Node.js 22+** built-in `node:http` & Server-Sent Events (`/api/stream`), vanilla ES2022 HTML5/CSS3/JS (**0 runtime npm dependencies**), container-ready for **Google Cloud Run** (`Dockerfile`, `PORT=8080`) and **Vercel** (`vercel.json`, `api/index.mjs`).

```text
Browser (Architectural Daylight UI — WCAG 2.1 AA, Zero innerHTML Sinks)
 ├── Overview Landing Page  → Live 4-City Indian Monitor (/api/pulse: Delhi, Mumbai, Bengaluru, Kolkata)
 ├── 4-Tab Dashboard (Auto-loaded with Live Delhi Telemetry on First Visit)
 │    ├── 1. Air & Forecast            → US AQI + 6-band EPA scale, OpenAQ v3 ground station card,
 │    │                                  6 pollutants, wind dispersion strip, interactive 24h SVG chart
 │    ├── 2. Daily Plan & Trade-Offs   → 3–6 step routine timeline, Scenario Comparison Lab,
 │    │                                  Sustainable Alternatives with Direct Impact explanations
 │    ├── 3. Indoor & Travel Tools     → EPA Smoke CADR Room Calculator, Avoided Vehicle-km + Fleet Context
 │    └── 4. Ask VayuDesha & Community → Live Gemini 2.5 Flash synthesis + citations, Community Brief export
 └── Slide-Over Household Drawer       → 4 Personas + 10 normalized inputs (browser localStorage only)
         │
         ▼  Same-origin validated JSON + SSE (Node.js 22 built-in HTTP, 0 runtime dependencies)
Server Modules: index.mjs · air.mjs · decisions.mjs · routine.mjs · room.mjs · choices.mjs · compare.mjs · evidence.mjs · ai.mjs
```

### API Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/health` | `GET` | Service health, `aiEnabled`, `aiProvider`, `aiModel`, `openaqEnabled`, `waqiEnabled` (zero secrets leaked) |
| `/api/pulse` | `GET` | 10-minute cached live 4-city Indian metro monitor (Delhi, Mumbai, Bengaluru, Kolkata) |
| `/api/stream?lat=...&lon=...` | `GET` | Real-time Server-Sent Events (`event: air`) with coordinate validation, 25s heartbeat, 5m refresh |
| `/api/cities?q=Delhi` | `GET` | Geocoding city search (GeoNames via Open-Meteo) |
| `/api/air?lat=...&lon=...` | `GET` | Real-time US AQI, 6 pollutants, surface meteorology, and live OpenAQ v3 observed station |
| `/api/plan` | `POST` | Household-calibrated plan, daily routine timeline, trade-off choices, and anonymous community brief |
| `/api/compare` | `POST` | Single-variable counterfactual household comparison under identical air conditions |
| `/api/room-plan` | `POST` | Source-, equipment-, and budget-tailored indoor room guidance + EPA smoke CADR estimate |
| `/api/chat` | `POST` | Grounded Gemini 2.5 Flash synthesis + action router with domain gateway & red-team boundaries |
| `/api/cadr`, `/api/travel-impact`, `/api/scenarios`, `/api/compare-options` | `GET` | Utility calculators & metadata |

---

## 3. Local Setup & Environment Variables

```bash
node --version          # Node >= 20.10.0 (tested on Node 22 & Node 26)
cp .env.example .env    # Optional: configure GEMINI_API_KEY and OPENAQ_API_KEY
npm run start:ai        # Starts server with .env loaded (or `npm start` for zero-key mode)
```

Refer to [`.env.example`](.env.example) for all supported configuration variables:
- `PORT=8080` (defaults to `3000` locally or `8080` in container/Cloud Run environments)
- `GEMINI_API_KEY` (Google Gemini API key; header-only `x-goog-api-key`)
- `GEMINI_MODEL=gemini-2.5-flash` (primary model) & `GEMINI_FALLBACK_MODEL=gemini-2.0-flash` (automatic failover)
- `OPENAQ_API_KEY` (OpenAQ API v3 key for live physical ground-monitor telemetry; header-only `X-API-Key`)

---

## 4. Running Automated Tests

```bash
npm test                # Runs all 96 built-in node:test unit, integration, security & red-team tests
npm run check:size      # Verifies repository source footprint (~0.53 MiB, well under 10 MB cap)
```

- **Test Suite Coverage (96/96 Passing):**
  - `tests/air.test.mjs` & `tests/realtime.test.mjs`: Multi-pollutant normalization, OpenAQ v3 freshness selection & stale-sensor filtering, real-time EPA US AQI conversion, Gemini 2.5 Flash structured schema & failover, in-flight request deduplication, and `/api/health` + `/api/pulse` + `/api/stream` contracts.
  - `tests/ai.test.mjs` & `tests/redteam.test.mjs`: 16 adversarial red-team tests covering prompt injection, respiratory emergencies, medication boundaries, CAQM GRAP legal boundaries, CPCB vs. US AQI index boundaries, and the code/image/off-topic domain gateway.
  - `tests/decisions.test.mjs`, `tests/choices.test.mjs`, `tests/compare.test.mjs`, `tests/v4.test.mjs`: EPA AQI breakpoints, schedule window feasibility, EPA smoke CADR math, avoided motorized travel impact, and room planner validation.
  - `tests/ui-integrity.test.mjs` & `tests/server.test.mjs`: Static DOM ID parity, zero `innerHTML`/XSS sink enforcement, zero hardcoded API keys, and strict CSP/security header verification.

---

## 5. Google Cloud Run & Vercel Deployment Commands

### Deploy to Google Cloud Run (`Dockerfile` included)

```bash
gcloud run deploy vayudesha \
  --source . \
  --region asia-south1 \
  --allow-unauthenticated \
  --port 8080 \
  --set-env-vars="GEMINI_MODEL=gemini-2.5-flash,GEMINI_FALLBACK_MODEL=gemini-2.0-flash" \
  --set-secrets="GEMINI_API_KEY=GEMINI_API_KEY:latest,OPENAQ_API_KEY=OPENAQ_API_KEY:latest"
```

### Deploy to Vercel

```bash
npx vercel deploy --prod
```

---

## Alignment with Evaluation Focus Areas

| Evaluation Pillar | How VayuDesha Achieves Top-Tier Readiness |
|---|---|
| **Problem Statement Alignment** | Solves Challenge 6 end-to-end: live winter smog & wind dispersion intelligence, OpenAQ v3 physical ground stations, 3–6 step low-emission daily routines, EPA smoke CADR room sizing, fan vs. purifier honesty, sustainable transport swaps with direct impact explanations, and anonymous community briefs. |
| **GenAI & Google Integration** | Live **Google Gemini (`gemini-2.5-flash`)** structured-JSON synthesis (`reply` + `directImpactSummary` + verified `actionIds`), strict pre/post-LLM domain gateway, and production **Google Cloud Run** containerization (`Dockerfile`). |
| **Code Quality** | 9 single-responsibility ES2022 `.mjs` server modules + vanilla accessible frontend, zero runtime npm dependencies, zero dead code, consistent `VayuDesha` naming across code, docs, and exports. |
| **Security** | Strict CSP (`default-src 'self'`), `COOP`, `CORP`, `HSTS`, `X-Frame-Options: DENY`, same-origin `POST` enforcement, 12 KB JSON body limit, zero `innerHTML` sinks, header-only API keys (`x-goog-api-key`, `X-API-Key`), per-IP rate & SSE connection caps. |
| **Efficiency** | **0.53 MiB** total source footprint (~5% of 10 MB limit), in-flight upstream request deduplication, multi-tier TTL caching (10m pulse / 20m air / 6h geocoding), parallel `Promise.all` telemetry ingestion, and graceful SSE-to-polling fallback. |
| **Testing & Accessibility** | **96/96 passing automated tests** (`node --test`), WCAG 2.1 AA contrast, semantic HTML5 landmarks, keyboard-navigable 4-tab bar & slide-over drawer, `aria-live` announcements, and auto-loaded live Delhi telemetry on initial visit. |

License: MIT. See `LICENSE`.
