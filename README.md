# VayuDesha — Urban Air Quality Decision Assistant

**Live Production App:** https://vayudesha.vercel.app  
**Repository:** https://github.com/deveshpunjabi/VayuDesha  
**Tagline:** *Same air. Different lives. Better decisions.*

---

## Chosen Vertical

**[Challenge 6] Urban Air Quality Assistant** — *Create a GenAI-powered assistant that helps families and communities navigate severe winter smog and urban air pollution. The application should suggest low-emission daily routines, indoor air quality hacks, and sustainable alternatives tailored to their location and lifestyle, while clearly explaining the direct impact of their choices.*

VayuDesha is designed around five real-world urban personas: **parents/caregivers** (school & outdoor play constraints), **active commuters** (cyclists/walkers balancing low emissions against exertion exposure), **fixed-shift workers** (who cannot shift departure times), **budget-constrained households** (fan-only or zero-budget homes), and **community organizers** (schools, housing societies, and workplaces needing anonymous shareable briefings).

---

## Approach and Logic

Rather than building another passive AQI number dashboard or an unconstrained chatbot that hallucinates medical claims, AirWise separates **deterministic scientific decision logic** from **evidence-locked GenAI routing**:

1. **Real-Time Multi-Pollutant & Winter Smog Meteorology Ingestion (`server/air.mjs`)**:
   - Pulls live regional **US AQI** and 6 pollutants (**PM2.5, PM10, NO₂, O₃, SO₂, CO**) plus 30-hour forecasts from **Open-Meteo / Copernicus CAMS**.
   - Fetches parallel **Open-Meteo Weather** telemetry (**wind speed, relative humidity, temperature, surface pressure**) to surface factual winter-smog dispersion context (e.g., light winds `< 8 km/h` slowing urban smoke dispersion), degrading gracefully if weather is unreachable.
   - Optionally integrates observed ground-station measurements via **OpenAQ v3** (`OPENAQ_API_KEY`, header-only `X-API-Key`) or **WAQI** (`WAQI_API_TOKEN`), strictly tagged `sourceType: 'observed'` and never mixed with or relabelled as CAMS model data or India CPCB AQI.
   - Rejects malformed coordinates, empty payloads, and stale (`> 3h`) timestamps; provides 4 explicitly labelled synthetic demo scenarios (`unhealthy 183`, `hazardous 355`, `moderate 77`, `unavailable`) for reproducible offline judging.
2. **Household-Calibrated Decision Engine (`server/decisions.mjs`, `server/routine.mjs`, `server/choices.mjs`, `server/compare.mjs`, `server/room.mjs`)**:
   - Normalizes 10 household constraints (`children`, `extraCare`, `commute`, `budget`, `home`, `flexibility`, `maxShiftMinutes`, `usualHour`, `outdoorHour`, `cookingHour`) with safe server-side bounds.
   - **Honest schedule feasibility:** Fixed schedules (`0 min`) and sub-hour flexibility (`15 min`) never receive fabricated alternate-hour suggestions from hourly forecasts; only flexible schedules (`>= 60 min`) compare same-day daytime future forecast hours.
   - **Indoor air hacks without false efficacy:** Tailors source-control steps (`cooking`, `incense`, `dust`, `mixed`), computes EPA metric smoke CADR (`m³/h`), and explicitly distinguishes standalone room fans (air circulation, not PM2.5 filtration) from particle purifiers.
   - **Transparent trade-offs & counterfactual proof:** *Decision Lab* separates exposure, emissions, and cost; *Same Air, Different Lives* holds the pollution snapshot constant while toggling one household constraint to show exact rule-level diffs; avoided motorized travel reports auditable `vehicle-km` rather than invented CO₂ savings.
3. **Evidence-Locked GenAI & Red-Team Safety (`server/ai.mjs`, `server/evidence.mjs`)**:
   - Supports **Google Gemini** (`GEMINI_API_KEY`, `responseSchema`) and **OpenAI** (`OPENAI_API_KEY`, strict `json_schema`), or runs transparently in **RULES MODE** without any API key.
   - The LLM acts strictly as a structured JSON router selecting **1–3 server-approved action IDs** or abstaining (`needs_clarification` / `unsupported`). The server validates every ID against the household's verified plan and composes all user-visible text and curated official citations—zero raw LLM prose reaches the user.
   - Severe breathing/chest emergencies and adversarial boundary queries (stopping inhalers, fabricating CAQM GRAP government orders, conflating CPCB vs. US AQI, 100% indoor safety guarantees, disease-risk %, CO₂ without vehicle data, exact home address, minute-level forecasts) bypass the LLM immediately with deterministic, evidence-linked responses.

---

## How the Solution Works

### Run Locally (Zero Dependencies Required)

```bash
node --version        # Node >= 20.10.0 (tested on Node 22 / 26)
npm test              # 94 built-in node:test cases (0 external packages)
npm run check:size    # ~0.50 MiB source (well under 10 MB limit)
npm start             # Opens at http://localhost:3000 (dual-stack IPv4 + IPv6)
```

> **Optional Live GenAI & Observed Station Mode:** Copy `.env.example` to `.env` (gitignored, never committed), add `GEMINI_API_KEY` (default `gemini-4-hydrogen` with automatic transient 503 failover to `gemini-2.5-flash`), `OPENAI_API_KEY` (`gpt-4.1-mini`), and/or `OPENAQ_API_KEY` (free at [explore.openaq.org/register](https://explore.openaq.org/register)) or `WAQI_API_TOKEN`, then run `npm run start:ai`. Without keys, all features work in full **RULES MODE** with live Open-Meteo data.
>
> **Vercel Deployment Ready:** Includes `vercel.json` (static `public/` + strict security headers + `/api/*` rewrite) and `api/index.mjs` reusing the zero-dependency `server/index.mjs` HTTP handler.

### User Flow & Architecture

```text
Browser (Swiss Civic Observatory — Crisp Light Editorial UI)
 ├── Overview Landing Page  → Live 4-City Indian Pulse (/api/pulse), Search, Demo Scenarios
 ├── 4-Tab Command Dashboard
 │    ├── 1. Live Air & Forecast     → US AQI + 6-band EPA scale, 6 pollutants, smog meteorology,
 │    │                                interactive 24h SVG chart, live SSE updates, Next 3 Moves
 │    ├── 2. Clean-Air Day & Lab     → 3–6 step timeline, Same Air Different Lives diff, Decision Lab
 │    ├── 3. Indoor & Impact Lab     → Clean-Air Room Planner (EPA CADR), vehicle-km tool, Action Plan
 │    └── 4. Community & Ask AirWise → Evidence-locked GenAI copilot, anonymous brief export, Sources
 └── Slide-Over Household Drawer     → 4 Personas + 10 normalized inputs (browser localStorage only)
         │
         ▼  Same-origin validated JSON + SSE (Node.js 22 built-in HTTP, 0 runtime dependencies)
Server Modules: index.mjs · air.mjs · decisions.mjs · routine.mjs · room.mjs · choices.mjs · compare.mjs · evidence.mjs · ai.mjs
```

### API Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/health` | `GET` | Service status, `aiEnabled`, `aiProvider` (`gemini` \| `openai` \| `null`), `waqiEnabled` (no secrets) |
| `/api/pulse` | `GET` | 10-minute cached live 4-city regional pulse (Delhi, Mumbai, Bengaluru, Kolkata) |
| `/api/stream?lat=...&lon=...` | `GET` | Real-time Server-Sent Events (`event: air`) with coordinate validation, 25s heartbeat, 5m refresh |
| `/api/cities?q=Delhi` | `GET` | Geocoding city lookup (GeoNames via Open-Meteo) |
| `/api/air?lat=...&lon=...` | `GET` | Modelled US AQI, 6 pollutants, smog meteorology, optional WAQI ground station |
| `/api/demo?scenario=hazardous` | `GET` | Reproducible synthetic judging scenarios (`unhealthy`, `hazardous`, `moderate`, `unavailable`) |
| `/api/plan` | `POST` | Household-calibrated plan, daily routine, Decision Lab choices, and anonymous community brief |
| `/api/compare` | `POST` | Single-variable counterfactual household comparison under identical air conditions |
| `/api/room-plan` | `POST` | Source-, equipment-, and budget-tailored indoor room guidance + EPA smoke CADR estimate |
| `/api/chat` | `POST` | Evidence-locked Gemini/OpenAI action router with deterministic safety & red-team boundaries |
| `/api/cadr`, `/api/travel-impact`, `/api/scenarios`, `/api/compare-options` | `GET` | Utility calculators & metadata |

---

## Assumptions Made

1. **AQI Index & Spatial Resolution:** Live default forecasts use **Open-Meteo / Copernicus CAMS** regional modelled **US AQI** (~45 km global resolution)—never relabelled as India's **CPCB National AQI** or street-level ground sensors. When `WAQI_API_TOKEN` is supplied, observed station data is displayed separately with its own attribution.
2. **Temporal Resolution:** Because forecasts are hourly, AirWise assumes sub-hour shifts (`< 60 min`, such as 15-minute departures) cannot be reliably differentiated from hourly data and explicitly withholds numeric alternate-hour claims.
3. **No Medical or Legal Authority:** AirWise is an informational decision aid, not a diagnostic tool or legal registry. It assumes active Delhi-NCR **GRAP** stages require official dated **CAQM** orders (`caqm.nic.in`) and never infers them from AQI thresholds.
4. **Indoor CADR & Travel Estimates:** EPA smoke CADR sizing assumes a standard ~2.4 m ceiling height (`smoke CADR in cfm >= 2/3 × room area in ft²`, converted to `m³/h`). Avoided motorized travel reports `2 × one-way km × round trips` (`vehicle-km`) assuming full trip displacement without guessing vehicle-specific CO₂ factors.
5. **Privacy & Storage:** No accounts or server-side user databases are assumed; household preferences stay in browser `localStorage` with a one-click clear button, and community exports strip all personal/household fields.
6. **API Licensing:** Open-Meteo's free tier is non-commercial with attribution (`Open-Meteo`, `Copernicus CAMS`, `GeoNames`); commercial production use would require appropriate licensing and distributed rate limiting.

---

## Alignment with Evaluation Focus Areas

| Evaluation Focus | How AirWise Addresses It |
|---|---|
| **Code Quality** | Clean, modular ES2022 `.mjs` architecture (`server/` + `public/`), pure deterministic logic separated from HTTP/UI, zero runtime npm dependencies, zero dead code. |
| **Security** | Strict CSP (`default-src 'self'`), `X-Frame-Options: DENY`, `Cross-Origin-Opener-Policy: same-origin`, `X-Permitted-Cross-Domain-Policies: none`, proxy HSTS, `Referrer-Policy: no-referrer`, same-origin `POST` enforcement, 12 KB JSON body cap, `Content-Type` validation, zero `innerHTML` sinks, server-only API keys (`x-goog-api-key` header, never query strings), per-IP rate & SSE stream limits (4/IP, 20 global, 30m max lifetime), 15 automated red-team prompt-injection & safety tests. |
| **Efficiency** | **0.512 MiB** total source (~5% of 10 MB cap), zero build step, zero external font/CDN bloat, TTL response caching (10m pulse / 20m air / 24h geocoding) with in-flight request deduplication (thundering-herd protection), capped SSE streams with clean disconnect teardown, and graceful `SIGINT`/`SIGTERM` shutdown. |
| **Testing** | **94/94 automated tests passing** via native `node:test` (`tests/air.test.mjs`, `ai.test.mjs`, `choices.test.mjs`, `compare.test.mjs`, `decisions.test.mjs`, `redteam.test.mjs`, `realtime.test.mjs`, `server.test.mjs`, `ui-integrity.test.mjs`, `v4.test.mjs`) + automated static secret/CSP checks + CI workflow (`.github/workflows/ci.yml`). |
| **Accessibility** | Semantic HTML5 landmarks, skip link, keyboard-navigable `tablist` & slide-over drawer (`Escape` + focus return), `aria-live` status updates, WCAG 2.2 AA contrast targets, >= 44px mobile touch targets, `prefers-reduced-motion`, accessible SVG chart summary, print stylesheet. Verified with **0 console errors** and **0 px mobile horizontal overflow** at `390×844` and `1440×900`. |
| **Problem Statement Alignment** | Directly solves Challenge 6 end-to-end: real-time smog intelligence, tailored low-emission daily routines, practical indoor hacks (CADR + fan vs. purifier + source control), community playbook, and transparent impact explanations. |

---

## Verification Status (19 November 2026)

- **Automated Tests:** `npm test` — **95 passed, 0 failed**.
- **Repository Size:** `npm run check:size` — **< 0.30 MiB** source-only (well under the 10 MB limit, zero runtime dependencies).
- **Live External Provider Proof:**
  - **Open-Meteo Air Quality (CAMS), Weather & Geocoding:** **REAL** — verified live HTTP 200 responses across `/api/pulse`, `/api/cities`, `/api/plan`, and `/api/stream` (SSE).
  - **Google Gemini (`gemini-4-hydrogen` with automatic `gemini-2.5-flash` 503 failover):** **REAL** — verified live authenticated HTTP 200 calls via server-side `.env` (strictly gitignored, header-only `x-goog-api-key`, `thinkingBudget: 0`).
  - **OpenAQ v3, OpenAI, and WAQI adapters:** Verified with mocked integration tests; ready for live keys via `.env` or Vercel Environment Variables.
  - **Live Browser QA (`1440×900` desktop & `390×844` mobile):** **VERIFIED** locally with 0 console errors, 0 failed requests, and 0 px horizontal overflow.

License: MIT. See `LICENSE`.
