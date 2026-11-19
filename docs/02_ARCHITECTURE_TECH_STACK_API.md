# AirWise v4 — Architecture, Technology Stack & API Contracts

**Doc ID AW-ARCH-4.0** — authoritative description of the *implemented* candidate, not aspirational enterprise architecture.

## A. Stack selection (reasoned)

| Layer | Selected | Why | Reconsider only if |
|---|---|---|---|
| UI | Semantic HTML5, vanilla ES2022 JavaScript | Very small, fast, no bundling, easy audit, 10MB-safe | A demonstrated component complexity problem justifies a framework |
| Style | Native CSS variables, layout/grid, reduced-motion support | Fully owned design system, no stock templates/assets | Visual acceptance tests demand otherwise |
| API | Node.js 22 built-in `http` and URL APIs | No runtime dependencies; reproducible minimal deployment | Scaling/observability requirements exceed current capacity |
| Logic | Pure, separately tested `.mjs` modules | Explorable and deterministic; safety thresholds not AI-authored | Additional independently validated scientific model is available |
| Live forecast | Open-Meteo Air Quality / Copernicus CAMS | Low-friction noncommercial prototype, U.S. AQI named | Authorized higher-resolution or observed source integrated |
| Geocoding | Open-Meteo location API (GeoNames data) | City-level location without GPS | Region data-quality issues require licensed alternative |
| GenAI | OpenAI Responses API, schema-bound JSON | Model selects approved action IDs or abstains; server composes text | Credentialed runtime test indicates contract changes |
| Persistence | Browser localStorage for preferences/checklists | No accounts and no server-side household profile storage | Explicit authorized requirement for opt-in synchronization |
| Tests | Native `node:test` and assert | Zero install, CI-friendly | Browser end-to-end automation is added as separate tool |
| Hosting | Any Node 22 HTTPS-capable provider with secrets | Low vendor lock-in | A chosen host requires adapter |

**Avoid:** Next.js/Tailwind+React+MongoDB+auth by reflex. Those would increase bundle/surface/complexity without improving the core judge story. A premium interface is about information clarity, not library count.

## B. Reference system boundaries

```
Browser: city, voluntary profile, question
        │ POST /api/plan and /api/chat (same-origin; validated JSON)
        ▼
Node HTTP service ── short TTL regional forecast cache ── Open-Meteo/CAMS model
        │                         │
        │                         └── geocoding search
        │
        ├── normalized profile / schedule constraints
        ├── deterministic recommend and safe exposure/emission ordering
        ├── My Clean-Air Day builder + evidence provenance
        ├── room CADR & indoor source controls
        ├── anonymous community brief
        ├── choice/comparison/vehicle-km calculators
        │
        └── optional model request ── OpenAI Responses JSON schema
                                      ▼
                         validated action IDs OR abstention
                                      ▼
                         server-authored approved response
                                      ▼
Browser: source-labelled status, routine, reasons, limits, share/export
```

**Explicit trust boundaries**: Incoming browser JSON is untrusted; incoming Open-Meteo JSON is untrusted; model output is untrusted; official external hyperlinks are allowlisted evidence URLs. Chat text is *never* reinserted as HTML. Node calls AI only when server-side credentials exist and local scope classification allows it.

## C. Modules

| File | Responsibility and guarantees |
|---|---|
| `server/index.mjs` | HTTP routing, body-size/type, same-origin checks, security headers, basic quotas, static allowlist |
| `server/air.mjs` | City lookup, rounded city coordinates, API calls/cache, timestamp validation, 4 labelled simulations |
| `server/decisions.mjs` | US AQI category boundaries, profile normalization, feasible hourly comparison, core actions and disclaimers |
| `server/evidence.mjs` | Curated publisher, relevant URL, claim scope and region by source |
| `server/routine.mjs` | 3–6 step recurring timeline, source/units/cost/qualitative confidence, anonymous community brief |
| `server/room.mjs` | Room-specific source control, fan/purifier/none, EPA smoke CADR |
| `server/choices.mjs` | Exposure, emissions and cost alternatives; community playbook |
| `server/compare.mjs` | Same air input, one changed persona, machine-readable differences |
| `server/ai.mjs` | Emergency/routing, schema-bound action IDs, local validation, server-composed response, bounded optional AI calls |
| `public/index.html` | Semantic layout, accessible labels, nav and controls |
| `public/app.js` | DOM orchestration, async request versioning, safe text rendering, exports and UI state |
| `public/styles.css` | Premium dark/teal visual system and reduced motion/print/mobile support |
| `tests/*.test.mjs` | Unit, regression, HTTP integration and UI structural checks |

## D. API contract (current candidate)

All JSON endpoints send `application/json`, `{error}` for failure, `Cache-Control: no-store` and error status; request JSON max 12,000 bytes. `/api/chat` has stricter per-process rate limiting; it is *not* distributed or persistent across deploy replicas. `/api/health` reflects configured credentials, **not proof AI provider works**.

| Endpoint | Input | Output | Contract caveats |
|---|---|---|---|
| `GET /api/health` | none | `{ok,aiEnabled}` | AI configured != live tested |
| `GET /api/cities?q=Delhi` | city string 2–65 chars | `{results:[{name,country,region,timezone,latitude,longitude}]}` | external geocoding may be unavailable |
| `GET /api/air?lat=...&lon=...` | valid coordinates | `{air}` | **Regional modeled US AQI**, not CPCB station |
| `GET /api/scenarios` | none | 4 allowed scenario descriptions | all synthetic |
| `GET /api/demo?scenario=hazardous` | one allowed synthetic scenario | `{air,plan,choices,community,routine,communityBrief}` | DO NOT imply live conditions |
| `POST /api/plan` | `{simulation, demoScenario?, lat?,lon?,timezone?,profile?}` | `{air,plan,routine,choices,community,communityBrief}` | live provider used only if simulation=false |
| `POST /api/compare` | same context plus `alternativeId` | `{comparison}` | same air snapshot as selection, no health causality |
| `POST /api/chat` | same context plus `question` | `{mode,status,reply,evidence,note?}` | AI optional; local rules/abstention are explicit |
| `POST /api/room-plan` | `{area,home,budget,source}` | `{roomPlan}` | qualitative guidance + EPA smoke CADR estimate |
| `GET /api/cadr?area=15` | room area m² | `{suggestedCadrM3h,unit,basis,source}` | backward compatible utility |
| `GET /api/travel-impact?distance=8&trips=3&mode=car` | one-way km, integer round trips, mode | `{vehicleKilometresNotDriven,unit,assumption,caveat}` | no CO₂ claim |
| `GET /api/compare-options` | none | `{options}` | four specific single-field scenarios |

**Example POST to `/api/plan`:**

```json
{
  "simulation": true,
  "demoScenario": "hazardous",
  "timezone": "Asia/Kolkata",
  "profile": {
    "children": true,
    "extraCare": false,
    "commute": "scooter",
    "budget": "free",
    "home": "fan",
    "flexibility": "limited",
    "usualHour": 8,
    "outdoorHour": 16,
    "cookingHour": 19,
    "maxShiftMinutes": 15
  }
}
```

Response properties carry a *data source/index/time*, actions, a `routine.kind='recurring-routine-template'`, impact kind, numerical value or null, evidence URLs, limitations, and scenario flag.

## E. Scheduling algorithm and scientific limitation

1. Validate a declared local timezone using `Intl.DateTimeFormat` with fallback UTC.
2. Normalize schedule to fixed (0-minute maximum), limited (15 minutes maximum), or flexible (120 minutes maximum). An explicit cap can reduce but not exceed the type cap.
3. Current model is *hourly*. A 15-minute shift does not support a valid comparison against a different hour: return **no quantitative timing recommendation** and a reason.
4. If flexibility >=60 minutes, find future, daytime eligible baseline matching `usualHour`, on same local day, and a candidate no farther away than the allowed minutes. Compare actual forecast PM2.5 and US AQI, never claiming indoor/biological exposure.
5. Only provide lower modeled concentration if the candidate improves both available AQI and PM2.5; no safe-hour claim.
6. Routine timeline uses recurring labeled times and is not a booked schedule, even when a departure time has passed. User must recheck conditions.

**Known limitation:** Hourly data and default hour-based preferences cannot represent exact arrival windows, walking duration, indoor exposure, school-specific policies or DST boundaries perfectly. More precision demands provider/UX validation rather than invented interpolation.

## F. Data provenance and domain rules

- `index='US AQI'` for CAMS scenario. Never infer CPCB category by transferring US AQI number. India National AQI categories are different.
- `sourceType='model'` or `'simulation'`; no `'observed'` unless licensed station feed is genuinely integrated.
- Reject invalid coordinates, empty readings and >3h stale model timestamp; do not silently fall back to a different city or synthetic values without a clearly separated mode.
- Hourly projection is a *model estimate* and cannot rank safer streets; CAMS global forecast is approximately 45km spatial resolution per Open-Meteo documentation.
- Match source to claim; a general US AQI basics page cannot support a precise emissions factor.
- World Health Organization PM2.5 guideline has a 24-hour averaging time; never compare an instantaneous forecast hourly value to it as though it were a one-hour legal limit.

## G. GenAI threat model and output contract

Input intent can be `supported`, `needs_clarification`, `unsupported` or `emergency`, decided conservatively by local routing for immediate safety. Model schema status is `supported|needs_clarification|unsupported`; supported must have 1–3 approved action IDs; other statuses must have zero IDs. Model text does not appear directly to users.

The code sends a small approved context to the OpenAI Responses API with `store:false`, maximum output tokens, timeout, server key, per-instance quota and up to three simultaneous calls. Provider refusal, malformed JSON, unknown ID or outage becomes `fallback` and checked local recommendation text. **This reduces risk but does not prove semantic relevance, prevent every social engineering attack, or eliminate provider privacy review.**

## H. Security and operation limitations

**Already in code:** static-file allowlist, same-origin POST checks, JSON content-type/body cap, no front-end secrets, CSP, frame protection, referrer restrictions, URL textContent rendering, simple per-IP in-memory quotas, no server-side chat history persistence, bounded provider fetch timeout.

**Not yet demonstrated at public scale:** CSRF under unusual proxy configurations, precise host origin policy, load-based memory usage, client abort handling across all flows, replicated rate-limit state, true daily spend enforcement across replicas, structured audit logging, automated browser accessibility checks and real-world network provider tests.

**Privacy:** Household inputs are stored in the browser until cleared. Chat questions go to the app server, and if AI enabled to the configured AI provider. Avoid names, diagnoses, home GPS, children's details. No claim of universal zero retention can be made on behalf of every host/provider.

## I. Dependency and licensing decisions

Node 22, no runtime NPM dependencies. Attribution to Open-Meteo and CAMS appears in the UI footer. The provider's free endpoint is non-commercial and has usage/availability limits. Verify terms before production/non-hackathon commercial use. OpenAI requests may incur cost and require credential and budget. No SaaS service is secretly necessary for rules-only demo.

## J. Production extension seam (not implemented)

Introduce a provider adapter returning `{sourceType,indexCode,observationOrModel,generatedAt,retrievedAt,lat,lon,values,uncertainty}` if legally authorized Indian official monitoring becomes available. UI must explicitly show source switch, local standard and confidence/age, and revalidate threshold logic for that index. CAQM orders require a dated authorized source with order number, validity and status; never inferred solely from AQI threshold.
