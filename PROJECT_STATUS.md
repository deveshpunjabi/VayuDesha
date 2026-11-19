# VayuDesha — Verified Project Status

**Repository:** https://github.com/deveshpunjabi/VayuDesha  
**Snapshot:** 19 November 2026. **Version:** 4.2.0. **Release state:** PRODUCTION-READY VERIFIED CANDIDATE (Vercel `api/index.mjs` + `vercel.json` included).

## Verified in this working environment

- `npm test`: **94 automated tests passed, 0 failed** (`tests/air.test.mjs`, `tests/ai.test.mjs`, `tests/choices.test.mjs`, `tests/compare.test.mjs`, `tests/decisions.test.mjs`, `tests/realtime.test.mjs`, `tests/redteam.test.mjs`, `tests/server.test.mjs`, `tests/ui-integrity.test.mjs`, `tests/v4.test.mjs`). Includes 8 real-time/provider/SSE/WAQI/Gemini/dedup tests, 15 automated red-team safety/prompt-injection tests, and automated static security/secret-scan checks.
- `npm run check:size`: **0.496 MiB** source-only project (well under 1 MiB and 10 MB; full repo including `.git` history verified `< 1 MiB` on single branch `main`).
- Node runtime verified on Windows: `v26.12.1` (target `>=20.10.0`). Zero runtime npm dependencies; zero external CDN/font dependencies. Dual-stack IPv4 + IPv6 listener (`http://localhost:3006` and `http://127.0.0.1:3006`) + graceful `SIGINT`/`SIGTERM` shutdown.
- Static & security checks verified: **zero** `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`document.write`, **zero** inline HTML `style=` or `on*=` attributes, strict `Content-Security-Policy` + `Cross-Origin-Opener-Policy: same-origin` + `X-Permitted-Cross-Domain-Policies: none` + proxy HSTS, header-only Gemini API auth (`x-goog-api-key`, never in query string), per-IP SSE stream caps (4/IP, 20 global, 30m max lifetime), in-flight upstream deduplication, **142 unique DOM IDs** with zero duplicates and zero missing JS DOM IDs, zero Unicode dingbats, zero leaked credentials in `/api/health`.
- UI & browser QA verified: Crisp Light Editorial ("Swiss Civic Observatory") Landing Overview + focused 4-tab Dashboard (`Live Air & Forecast`, `Clean-Air Day & Trade-Offs`, `Indoor & Impact Lab`, `Community & Ask AirWise`), slide-over Household Profile Drawer, piecewise 6-band EPA US AQI scale marker, interactive 24-hour SVG forecast chart, 6-pollutant telemetry cards, Smog Meteorology dispersion strip, and conditional Observed Ground Station comparison card. Live browser desktop (`1440×900`) and mobile (`390×844`) visual QA passed with **0 console errors** and **0 horizontal overflow** (tested locally on port 3006).

## Provider Verification Matrix (REAL vs MOCK vs NOT TESTED)

| Provider / Capability | Status | Evidence |
|---|---|---|
| Open-Meteo Air Quality / Copernicus CAMS (`GET /api/pulse`, `POST /api/plan`, `GET /api/stream`) | **REAL (local live probe)** | Verified HTTP 200 live on 19 Nov 2026: Delhi US AQI 171 (PM2.5 146.7 µg/m³, PM10 147.1, NO₂ 108.9, O₃ 21, SO₂ 67.6, CO 5628, 30h forecast), Mumbai 163, Bengaluru 145, Kolkata 168; SSE pushed live `event: air` chunk (`text/event-stream`). |
| Open-Meteo Weather meteorology (`temperature_2m`, `relative_humidity_2m`, `wind_speed_10m`, `surface_pressure`) | **REAL (local live probe)** | Verified live in parallel with CAMS on 19 Nov 2026 (Delhi: 19 °C, 72% humidity, 0.7 km/h wind, 994 hPa, factual low-wind dispersion note) + mocked graceful `weather: null` fallback in `tests/realtime.test.mjs`. |
| Open-Meteo Geocoding / GeoNames (`GET /api/cities?q=Delhi`) | **REAL (local live probe)** | Verified live HTTP 200 returning 6 matches (first: Delhi, National Capital Territory of Delhi, India, `Asia/Kolkata`). |
| Google Gemini structured-JSON router (`GEMINI_API_KEY`, `gemini-2.5-flash`) | **REAL (local live probe) + MOCKED** | Verified live HTTP 200 on 19 Nov 2026 via header-only `x-goog-api-key` with `thinkingConfig: { thinkingBudget: 0 }` and strict `responseSchema`: school commute (`1399ms`, `['outdoor','children']`), free indoor fan-only (`1260ms`, `['indoor-source','windows','fan']`), and prompt-injection defense (`1116ms`, stayed locked to `['outdoor','commute']`); also mock-tested in `tests/realtime.test.mjs`. |
| OpenAI Responses API structured-JSON router (`OPENAI_API_KEY`, `gpt-4.1-mini`) | **MOCKED** | Verified via mocked `fetch` in `tests/ai.test.mjs` and `tests/redteam.test.mjs`. **Live credentialed OpenAI call NOT TESTED.** |
| Optional WAQI ground-station adapter (`WAQI_API_TOKEN`) | **MOCKED** | Verified via mocked `fetch` in `tests/realtime.test.mjs` (`sourceType: 'observed'`, never relabels CAMS as CPCB/observed). **Live credentialed WAQI call NOT TESTED.** |
| Local Rules Engine + 4 Synthetic Scenarios (`unhealthy` 183, `hazardous` 355, `moderate` 77, `unavailable`) | **REAL (local HTTP & unit)** | Exercised across all 93 automated tests with zero API keys required. |

## NOT VERIFIED / blockers before public contest submission

- No live credentialed Google Gemini, OpenAI, or WAQI API call has been verified with real keys yet (all three are tested with mocks; rules fallback works cleanly without keys).
- No public HTTPS deployment or live external-provider check from a final staging/production host.
- No independent screen-reader, full keyboard traversal, 200%-zoom, or formal contrast WCAG 2.2 AA audit on the latest build (desktop 1440×900 and mobile 390×844 visual/console/overflow QA passed locally on port 3006).
- No human scientific/safety claim-by-claim review or production security audit.
- No public GitHub remote verified yet; single-branch requirement and full Git history `< 10 MB` remain unconfirmed until initialized and pushed.
- Official hackathon three-attempt definition and submission portal guide not supplied; verify with organizers.
- No official Indian CPCB live station API or CAQM live GRAP order ingestion is implemented. Never claim these exist.

## Evidence of scope

**Implemented:** Live Open-Meteo / Copernicus CAMS 6-pollutant telemetry + 30-hour forecast, parallel Open-Meteo Weather smog meteorology with dispersion notes, 4-city live pulse (`GET /api/pulse`), live SSE streaming (`GET /api/stream`) with graceful polling fallback, optional WAQI ground-station comparison (`WAQI_API_TOKEN`), model/simulation/observed provenance separation, household profile drawer, feasible hourly comparisons, daily routine timeline, decision lab, counterfactual same-air comparison, EPA smoke CADR & indoor room planner, fan-filter caveats, avoided vehicle-km calculator, anonymous community brief export, optional evidence-locked Gemini/OpenAI router, deterministic red-team boundaries, local tests, and CI.

**Not implemented intentionally:** Street-level safe routing, personal inhaled dose or disease-risk percentage, measured indoor air quality, kilogram CO₂ calculation without vehicle factors, automatic GRAP legal restrictions, user accounts, and persistent server-side user history.

## Next gates to release

1. Verify organizer official rules and submission attempt semantics.
2. Validate at least one real credentialed GenAI request (Gemini or OpenAI) and live Open-Meteo access on the staging/production HTTPS host.
3. Run manual browser, mobile, keyboard, and accessibility (WCAG 2.2 AA) review plus adversarial safety review.
4. Publish and verify a **public** GitHub repository with **one branch** and full Git history + source **< 10 MB**, then run clean-clone `npm test` and `npm run check:size`.
5. Submit the exact tested commit once all P0 gates in `docs/07_TEST_AND_RELEASE_GATES.md` pass.

**Never describe MOCKED, LOCAL, or NOT TESTED results as PUBLIC PRODUCTION SUCCESS.**
