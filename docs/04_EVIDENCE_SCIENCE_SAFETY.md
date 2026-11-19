# AirWise v4 — Scientific Validity, Evidence and Safety Protocol

**Doc ID AW-SCIENCE-4.0.** Public sources checked 19 November 2026. Scientific claims must be tied to sources with matching scope, not mere hyperlinks.

## 1. Evidence policy

Evidence must contain publisher, title, URL, geographical scope, supported claim, date checked, and caveats. Use `server/evidence.mjs` for curated sources. Each emitted action has a known `source` URL. A human must revalidate URLs and medical relevance before production release; tests check syntax and registry coverage, not scientific peer review.

| Claim type | Primary reference | Allowed formulation | Forbidden extrapolation |
|---|---|---|---|
| U.S. AQI category | [AirNow U.S. AQI](https://www.airnow.gov/aqi/aqi-basics/) | U.S. AQI categories and broad outdoor activity precautions | Claiming this number is India's National AQI |
| Children's outdoor activity | [AirNow school activity](https://www.airnow.gov/publications/activity-guides/air-quality-and-outdoor-activity-guidance-for-schools/) | Consider reducing/rescheduling strenuous outdoor activity by category | Guaranteeing a child is safe/unsafe on a specific playground |
| Outdoor particle precautions | [AirNow PM activity guide](https://www.airnow.gov/sites/default/files/2023-03/air-quality-guide-for-particle-pollution_0.pdf) | Air-quality categories and activity guidance | Exact personal inhaled dose or disease-risk % |
| Indoor cleaner room | [EPA cleaner air room](https://www.epa.gov/wildfires/how-create-cleaner-air-room-home) | Reducing indoor particle sources, adequate filtration | "Shut windows forever" or "indoor air is safe" |
| Filtration sizing | [EPA home air cleaners](https://www.epa.gov/indoor-air-quality-iaq/guide-air-cleaners-home) | Smoke CADR approx 2/3 room area in ft² (cfm), source control, ventilation | Purifier guarantees an exact percent reduction |
| Indoor smoke/ventilation | [EPA improving IAQ](https://www.epa.gov/indoor-air-quality-iaq/improving-indoor-air-quality) | Source reduction, safe ventilation tradeoffs | Fan alone filters PM2.5 |
| Emissions from driving | [EPA vehicle action](https://www.epa.gov/transportation-air-pollution-and-climate-change/what-you-can-do-reduce-pollution-vehicles-and) | Avoid unnecessary idling and personal motorized travel | Claim exact kg CO₂ saved with no vehicle factor |
| Model capability | [Open-Meteo AQ API](https://open-meteo.com/en/docs/air-quality-api) | CAMS regional modelled US AQI/PM predictions | Street-level precision or station measurement |
| India National AQI | [CPCB National AQI](https://app.cpcbccr.com/ccr_docs/About_AQI.pdf) | Different India categories/scale | Numeric conversion from US AQI with no full method/data |
| Delhi-NCR restrictions | [CAQM official orders](https://caqm.nic.in/) | Link dated official current orders | Infer GRAP stage automatically from current AQI |
| WHO concentrations | [WHO 2021](https://www.who.int/publications/i/item/9789240034228) | 24-hour PM2.5 guideline 15µg/m³ and annual 5µg/m³ | Treat hourly forecast vs 24h average as direct threshold |
| Accessibility | [W3C WCAG 2.2](https://www.w3.org/TR/wcag/) | Target verified AA tests | Claim certified without third-party review |

**Science authority:** Prefer WHO, EPA/AirNow, CPCB, CAQM, Open-Meteo provider docs over blogs. Research/medical advice must not be inferred from a generic search snippet. Document future scientific changes with version, source and regression tests.

## 2. AQI standard and provenance decisions

The provider currently returns US AQI and PM2.5 from global/regional CAMS modeling; it is *not* a real-time India CPCB monitoring station. India CPCB uses Good 0–50; Satisfactory 51–100; Moderate 101–200; Poor 201–300; Very Poor 301–400; Severe 401–500. US AQI has different category labels and thresholds. **Never change the label without implementing and verifying the proper calculation using sufficient pollutant inputs and valid averaging periods.**

A provider failure or absence of current AQI is not clean air. Synthetic modes must always say "DEMO ONLY" with no claim that a city currently has a displayed reading.

## 3. Numeric claims allowed in this version

**Hourly outdoor PM2.5 comparison:** `delta = baseline_model_pm25 - lower_model_pm25`, units µg/m³. Constraints: same local day, within maximum declared shift, future eligible hours, both AQI and PM2.5 lower. **Not** measured personal exposure, inhaled dose, air safety or health outcome.

**Avoided personal motorized distance:** `2 × one_way_km × displaced_round_trips`, units vehicle-km; valid only if entire trip truly avoided without substitute motorized trip. **Not** kg CO₂, local AQI change, or inhaled dose.

**Approximate smoke CADR:** `ceil_to_nearest_10[(room_m² × 10.7639 ft²/m² × 2/3 cfm/ft²) × 1.6990 m³/h per cfm]`, units m³/h, standard-height room guidance. Placement, ACH, ceiling height, leakiness and device performance are not measured.

**Qualitative impacts:** Source control, less unnecessary outdoor exertion, potential transport emission direction, potential filtration benefit. These are not quantifiable without user-specific observations or factors.

## 4. Guidance priority and conflicting objectives

When a cycling choice may reduce tailpipe emissions but increase outdoor exertion in high smog, prioritize avoidable exposure reduction and clearly explain the emissions trade-off. Essential travel cannot simply be cancelled. Zero-cost households must receive useful source-control advice, not a forced purchase. People needing extra precautions should follow their existing clinician plan, and concerning symptoms require clinical attention; an emergency goes directly to local emergency services.

## 5. Fan-only and ventilation risks

An unfiltered household fan moves air, not fine-particle filtration. Proper DIY box-fan filters require the right filter, safe assembly/electrical choices, and careful guidance; AirWise does **not** provide an unsafe make/model-specific build recipe. Particle filtration is supplementary to source control and necessary ventilation. Cooking, combustion, CO and indoor gases can accumulate even with windows closed; heat stress and smoke conditions can affect ventilation choices. No universal "seal every window" rule.

## 6. GenAI safeguards and residual risk

Model can classify an eligible question and rank verified action IDs. Server verifies actions are from `buildPlan`, formats the text and evidence, and abstains on unsupported intent. Emergency symptoms bypass the LLM. This **does not** prove perfect relevance or complete safety. Required adversarial review: prompt injection trying to bypass action IDs, model adding medical diagnosis, hallucinating GRAP orders, ignoring fixed shift, treating synthetic as current, prescribing a pollutant-removal percentage, exposing credentials, and recommending strenuous outdoor biking solely for climate reasons.

## 7. Safety acceptance gate

No release until all high-impact claims have a matching authoritative source, the source is accessible, the averaging period and pollutant unit are right, every numeric result has assumptions/caveats, and adverse/high-smog or missing-data routes are shown to at least one human reviewer. If evidence is insufficient, the UI says so; it does not disguise uncertainty with polished AI prose.
