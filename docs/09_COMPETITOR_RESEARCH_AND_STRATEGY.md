# AirWise v4 — Competitor Reverse Engineering & Competition Strategy

**Doc AW-STRATEGY-4.0.** Feature comparisons are from *public product pages and documentation*, not proprietary code inspection or live subscriptions. Verify current feature sets before making competitive claims during judging.

## 1. The landscape

| Product / source | Public strength | AirWise should not falsely claim to invent | Defensible AirWise difference |
|---|---|---|---|
| [IQAir AirVisual](https://www.iqair.com/air-quality-monitors/air-quality-app) | Air quality monitoring, pollution data/maps, forecasts | AQI charts, city data, alerts | Household-specific, feasibility-checked **decisions** with reason/impact and budget context |
| [Plume Labs](https://plumelabs.com/air/) | Air-quality map/forecast, activity advice | Forecast-dependent activity suggestions | Family/school/work/indoor/community decisions in one routine |
| [Airveda](https://www.airveda.com/dashboard) | India-related monitoring and indoor device ecosystem | Device monitoring or CPCB presence | Useful low-cost household advice without sensor purchase; honest model/source separation |
| [AirCare](https://www.getaircare.com/) | AQI and multiple environmental indicators | Additional environmental dashboards | Quantifiable and clearly bounded action explanation, not more indicators |
| [Open-Meteo](https://open-meteo.com/en/docs/air-quality-api) | Hourly CAMS modeled pollutant and AQI forecasts | Raw weather/air forecast technology | Transparent interpretation constrained by family needs |
| [Google Air Quality API](https://developers.google.com/maps/documentation/air-quality/overview) | Higher-resolution modeled environmental information, local indices | Precision AQI modeling | Decision layer and honest uncertainty, not a fabricated 500m model |

Public feature coverage is evolving. Do not claim to have exclusive features without exhaustive review; market differentiation is a product **combination and trust experience**, not proof of a patentable innovation.

## 2. Where generic chat-AQI demos fail

1. User enters city and sees AQI but cannot answer "what changes tomorrow morning?".
2. Generic suggestions ignore a fixed school departure or budget.
3. Cycling is promoted unconditionally as sustainable even during severe outdoor particulate pollution.
4. A model invents "your exposure fell 35%" with no personal measurements.
5. Indian audiences see US AQI but the product says CPCB scale.
6. A black-box safety score or prompt cannot explain *why* choices changed.
7. The demo requires internet/API keys but has no honest failure mode.
8. UI appears premium yet mobile keyboard, source links, and error controls fail.
9. README is vague, repository contains binaries and multiple branches.

## 3. Differentiator to show judges

**"Same air. Different lives."** Keep a single synthetic AQI 355 snapshot, toggle (a) child at home, (b) cyclist, (c) fixed 8am obligation, (d) fan-only/no budget. Show actual changes in rule outputs, not just AI rewording. Then ask a constrained question and demonstrate safe answer/abstention and evidence.

The value chain: 
**Data truth** (source/index/time) → **Human context** (needs/constraints) → **Feasible actions** (tested logic) → **AI communication** (approved action selection or abstention) → **Impact boundary** (units/assumptions) → **Share/act** (personal/community brief).

## 4. Evaluation defense

| Judging dimension | What to show in demo or source |
|---|---|
| Problem alignment | child/school + commute + indoor + low emissions + community + impact |
| Logical assistant | changing persona changes actions, schedule option disappears if infeasible |
| Security | CSP, server-side secrets, no raw model advice, basic rate limits and privacy notice |
| Efficiency | dependency-free Node, very small repo, caches, strict API contracts |
| Testing | baseline/regression tests, hazardous/unknown state, mocked AI outage and real-call release gap |
| Accessibility | semantic labels, focus, text equivalent of graph, mobile; separate human verification record |
| Code quality | pure modules, claims/evidence registry, README, deterministic tests, clear non-goals |

## 5. What not to add for scoring

Do not prioritize 3D smog globe, generic gamification points, fake "AI-powered prediction" charts, complex auth, chat history database, frequent push notifications, social feed, photos/video assets, or unlicensed India monitoring integration. They add little to core PS and increase security/size/risk. Even if a feature is visually impressive, ask what decision it improves and what evidence supports it.

## 6. Primary research and terms

- [WHO 2021 global guidelines](https://www.who.int/publications/i/item/9789240034228)
- [AirNow AQI and particle guides](https://www.airnow.gov/aqi/aqi-basics/)
- [EPA cleaner air room](https://www.epa.gov/wildfires/how-create-cleaner-air-room-home)
- [EPA vehicles/emissions](https://www.epa.gov/transportation-air-pollution-and-climate-change/what-you-can-do-reduce-pollution-vehicles-and)
- [CPCB National AQI](https://app.cpcbccr.com/ccr_docs/About_AQI.pdf)
- [CAQM official orders](https://caqm.nic.in/)
- [Open-Meteo air-quality API](https://open-meteo.com/en/docs/air-quality-api)
- [Open-Meteo pricing](https://open-meteo.com/en/pricing)
- [W3C WCAG 2.2](https://www.w3.org/TR/wcag/)

**Important:** Open-Meteo free API is noncommercial and has no guaranteed uptime; attribution required. Production monetization or heavy traffic requires terms/license verification. Official India National AQI and any active Delhi-NCR legal orders must be obtained through authorized, dated original sources.
