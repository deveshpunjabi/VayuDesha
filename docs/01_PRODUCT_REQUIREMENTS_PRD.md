# AirWise v4 — Product Requirements Document (PRD)

**Status:** v4 implementation candidate; local tests passing, release NOT approved.  
**Product:** AirWise | Personal Clean-Air Copilot  
**Challenge vertical:** Challenge 6 — Urban Air Quality Assistant  
**Owner:** Project team. **Date:** 19 November 2026. **Document ID:** AW-PRD-4.0.

## 1. Executive decision

AirWise is **not a medical app, a pollution sensor, or a route-level safety oracle**. It is an evidence-constrained, context-aware *decision support tool* that helps households and communities adapt routines during smog while recognizing that protective health choices, emission reduction, cost, and fixed obligations can conflict.

**North-star outcome:** A user can answer: *What should I actually do today, what is feasible for my household, why was it suggested, how could it affect exposure or emissions, and what is uncertain?*

**Positioning:** "Same air. Different lives. Better decisions." Compared with IQAir, Plume Labs, and other AQI products, differentiation is not live monitoring itself; it is explainable, feasible, budget-aware daily planning. Do not claim a proprietary scientific model or verified pollutant removal.

## 2. Traceability to exact challenge wording

| Challenge clause | Required user experience | Implementation anchor | Evidence of success |
|---|---|---|---|
| GenAI-powered assistant | Accept natural-language smog/routine questions; use schema-checked action selection and abstention | `server/ai.mjs`, Ask AirWise | One *real* credentialed request required at release; mocks do not qualify |
| Families and communities | Parent, cyclist, shift worker, budget household; anonymous school/housing brief | `server/routine.mjs`, `server/choices.mjs` | Five distinct scenarios, downloaded brief without PII |
| Severe winter smog | Highly polluted and missing-data states | `getSimulatedAir` hazardous/unavailable; rules | US AQI 355 demo says hazardous, never says safe |
| Low-emission daily routines | Prioritize necessary journeys, reduce optional motorized travel, account for time constraints | daily routine, decision lab, travel-km tool | No recommendation to replace a necessary trip with unsafe cycling |
| Indoor air quality hacks | Source control, ventilation caveats, fan vs filter distinction, room CADR | `server/room.mjs` | Different action sets for fan, purifier, budget |
| Tailored to location and lifestyle | City search, model data, seven+ household inputs, max shift | city API, profile normalization | Modifying meaningful inputs changes outputs in defined scenarios |
| Explain direct impact | Source + why + units/assumptions + limitations | evidence registry, cards, calculations | No fabricated percentage or carbon total |
| Smart dynamic assistant | Constrained rule engine + AI action selection with fallback | server | Reliable behavior under provider outage |
| Clean maintainable code | Dependency-free modules, tests, docs, CI | all | Clean clone and `npm test` pass |
| Security, efficiency, testing, accessibility | validated server calls, caches, no frontend secret, semantic HTML | server/HTML/CSS/tests | Automated + manual signoffs |

## 3. People, contexts and primary jobs

**P1 Parent / caregiver:** Child must reach school at 8 AM, schedule cannot always shift. Needs safe *feasible* guidance, school-play considerations, household source control and low-cost steps. Must not disclose child's name or diagnosis.

**P2 Active commuter:** Bikes or walks; wants low-emission transport without ignoring increased outdoor exertion during smog. Needs honest exposure-versus-emissions comparison.

**P3 Fixed-shift worker:** Cannot change travel time; product must not recommend a fictitious best hour. Focus on optional travel, indoor routines and feasible decisions.

**P4 Budget-constrained home:** Only fan/no purifier, cannot buy new equipment. Needs free source-control actions and a frank distinction between circulation and filtration.

**P5 Housing/school/workplace organizer:** Wants an anonymized, dated source-labelled community briefing, without legal orders inferred from pollution levels.

**Context notes:** India-first presentation but currently Open-Meteo/CAMS *regional modeled U.S. AQI* in live mode. India's CPCB National AQI is distinct. No precise street-location or indoor sensor data.

## 4. Jobs to be done and critical journeys

1. **First-run planning (no key):** Load Delhi city forecast if provider works; otherwise choose explicitly synthetic sample; choose persona; see status, three actions and daily routine; export brief.
2. **Constrained daily schedule:** Set departure 8 AM, fixed/15-minute/120-minute flexibility, childcare status, play and cooking times; see only feasible forecast comparisons. Under 15 minutes, hourly data cannot support a numerical difference.
3. **High-smog bike decision:** Hazardous sample + cycle. The system must prioritize reducing unnecessary outdoor exertion and explain tailpipe benefit separately.
4. **Indoor budget plan:** Enter room m², household fan, source and budget. Receive EPA smoke CADR estimate and source-specific tips, with explicit device limitations.
5. **Community share:** Generate generic text without location narrower than selected city, names, profiles, health conditions, or false active orders.
6. **AI question:** Ask "I cannot move my shift. What else can I change?" and see source-grounded actions. An unrelated query must produce clarification or abstention, not filler.
7. **Outage:** Provider unavailable: display stale/unavailable state, not fabricated live reading. Sample data must retain a conspicuous simulation label.

## 5. Functional requirements and feature prioritization

Legend: **D** = implemented and locally automated-tested, **P** = partially implemented / requires manual verification, **N** = not implemented; **P0** = release critical, **P1** = high-value extension, **P2** = optional post-demo.

| ID | Feature | Priority | Status | Product acceptance rule |
|---|---|---|---|---|
| F-01 | Geo city search | P0 | D (mocked) | Select valid city; reject invalid search; verify live provider separately |
| F-02 | CAMS forecast adapter | P0 | D (mocked) | Explicit US AQI, source, timestamp, location, stale rejection |
| F-03 | Synthetic scenario selector | P0 | D | Unhealthy, hazardous, moderate and unavailable visibly labelled |
| F-04 | Household profile | P0 | D | Children/extra-care/commute/budget/home/time/flexibility inputs normalized |
| F-05 | Actual schedule feasibility | P0 | D | 0/15/120-min capabilities; no 15-min inference from hourly data |
| F-06 | My Clean-Air Day timeline | P0 | D | 3–6 recurring template items with impact, source, limitations |
| F-07 | Evidence-grounded recommendation engine | P0 | D | No model-created medical or pollutant thresholds |
| F-08 | Action explanation | P0 | D | Why, possible impact category, limitations and source link |
| F-09 | Structured GenAI action selection | P0 | P | Implemented; real API credential test pending |
| F-10 | AI abstain/clarify/emergency paths | P0 | D | Unrelated/incomplete/emergency questions routed conservatively |
| F-11 | Rules-only and provider-failure fallback | P0 | D | Clearly labelled mode; no fake AI claim |
| F-12 | Same-air persona comparison | P0 | D | Visible delta in changes/feasibility while pollution held fixed |
| F-13 | Trade-off decision lab | P0 | D | Emission, exposure and cost reasons clearly separated |
| F-14 | PM2.5 forecast comparison | P0 | D | µg/m³ forecast concentration, same day, within feasible shift |
| F-15 | Vehicle-km bookkeeping | P1 | D | 2 × distance × round trips, not CO₂ measurement |
| F-16 | Smoke CADR calculator | P1 | D | EPA formula, unit conversions and assumptions |
| F-17 | Clean-air room planner | P1 | D | Fan/purifier/no equipment, source and budget affect actions |
| F-18 | Three-action checklist | P0 | D | Browser-only, not represented as achieved health benefit |
| F-19 | Anonymous community brief | P1 | D | No names or household characteristics in export |
| F-20 | Printable/exportable personal brief | P1 | D | Contains daily routine, data provenance and disclaimers |
| F-21 | Semantic mobile-first interface | P0 | P | Implemented CSS; independent device and screen-reader review pending |
| F-22 | Browser-only saved preferences | P1 | D | No account; clear-local action; privacy notice |
| F-23 | India National AQI observed-station provider | P1 | N | Only after authorized licensing and source-verification contract |
| F-24 | Dated Delhi-NCR GRAP orders | P1 | N | Use official order identifier; never infer stage from AQI alone |
| F-25 | Reviewed Hindi accessibility | P2 | N | Human-reviewed safety translations before public use |
| F-26 | Opt-in reminders or push alerts | P2 | N | Consent, relevant verified data, delivery and privacy controls |
| F-27 | Actual CO₂ emissions calculator | P2 | N | Requires credible factor set, occupancy and replacement-trip model |
| F-28 | Sensor integration/indoor readings | P2 | N | Requires calibration and sensor QA; no invented readings |
| F-29 | Production observability and distributed rate limiting | P0 for scale | N | Logging and store after host architecture known |
| F-30 | Public live deployment + signed release checks | P0 | N | Real staging tests, public single-branch GitHub repo under 10MB |

## 6. Requirements that should NOT be implemented now

- Proprietary street-by-street "safe route" map based on ~45km global CAMS forecast; unsupported precision.
- Automated diagnosis, medication changes, or quantified disease-risk savings.
- Automatic GRAP-stage legal restriction statements without signed dated official order.
- Carbon impact claims without emission factor methodology, vehicle class, occupancy and displacement assumptions.
- Compulsory login, stored health profiles, payments, commercial product recommendations, face tracking, heavy 3D globe, noisy animations, paid external services that jeopardize hackathon evaluation.

## 7. Data and metrics definition

- `aqi`: explicitly **US AQI** as provided by forecast model; not India's National AQI.
- `pm25`: forecast concentration in **µg/m³**; comparison is Δ between forecast hours, not personal dose.
- `sourceType`: `model` or `simulation`; timestamps are mandatory for live readings.
- `vehicleKilometresNotDriven`: km avoided only when a personal motorized round trip is entirely displaced; not CO₂ avoided.
- `smokeCadrEstimate`: m³/h translated from EPA rule (smoke CADR in cfm at least two-thirds room area in square feet).
- `dailyRoutine`: recurring approximate template. If action time is in the past, it describes a pattern, **not** a live appointment or current instruction.
- `confidence`: qualitative/modeled comparison; no numerical confidence intervals without validation.

## 8. Success criteria: demo and engineering, not invented external outcomes

**Functional:** Ten repeatable scenarios run without crash; same inputs yield same recommendations; two profiles produce meaningfully different recommendations where relevant; emergency/unsupported queries do not result in hallucinated advice.

**Trust:** 100% of demo-visible air readings identify source/index/time/model-vs-simulation; 100% of quantitative claims identify units/formula/caveats; 0 unsupported active-GRAP or personal-health-risk claims.

**Accessibility target:** WCAG 2.2 AA via manual + automated checks; 320/360/390px, keyboard, 200% zoom and accessible charts via adjacent text. These are targets pending independent testing.

**Operations:** Self-contained `npm start`; 70+ deterministic automated tests; source and Git history <10MB; one public branch; no keys. No final score or winning probability is asserted.

## 9. Primary risks and decisions

| Risk | Impact | Mitigation | Owner/verification |
|---|---|---|---|
| Forecast treated as local sensor | Safety & credibility | labels, source provenance, location limits | science reviewer |
| GenAI invents facts or recommends irrelevant action | high | action-ID allowlist + abstention + manual adversarial tests | backend owner |
| Time shift not feasible | high | bounded hourly comparison; no sub-hour claims | logic tests |
| "Fan" falsely presented as filtration | high | explicit fan guidance; no percentage | product + science review |
| PII in community export | privacy | omit profile and location details except broad context | privacy tests |
| Caching/stale provider and outages | high | timestamp validation, expiring cache, sample fallback labelled | API tests |
| Free API commercial license | legal | noncommercial demo + attribution; paid license if commercial | deployment owner |
| GitHub submission constraints | fatal | public, main only, size with Git history, README clean clone | release owner |
| Three-attempt ambiguity | fatal | verify organizer guide; do not use attempts for trial-and-error | submission owner |

## 10. Assumptions and open questions

1. Organizer's "maximum three attempts" definition and submission portal document are not available; obtain official version before first attempt.
2. The exact approved AI platform may be organizer-specific; ensure actual platform availability before submission.
3. Real Open-Meteo and OpenAI provider requests have NOT been independently verified on a public deployment.
4. Official CPCB observed-data use requires an authorized API and correct licensing; not supplied.
5. No validated per-user carbon emission factors, indoor sensor data or route-level modeled exposure are available; numerical claims stay limited.
6. The app is a hackathon prototype, not a medical advice or regulatory enforcement system.

**PRD decision rule:** A feature cannot be marked done because a mock test passed. Each P0 item requires code, tests, documentation, and (where applicable) a real external verification record.
