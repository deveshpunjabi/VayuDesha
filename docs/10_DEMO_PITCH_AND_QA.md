# AirWise v4 — Judging Demo, Storyboard & Defensive Q&A

**Doc AW-DEMO-4.0.** Use **synthetic values deliberately** for reproducibility; do not say "Delhi currently has AQI 355". A real city data call and real GenAI request can be included only if independently verified.

## 1. Opening promise

"A pollution app tells us whether the air is bad. AirWise helps different people decide what they can realistically do about it. It also shows what we can and cannot calculate." 

**Demo setup:** server started, sample scenario chosen, no need for secret if doing rules-only features. For a GenAI demo, have host secret configured and real call verified before judges arrive. Keep a backup recording or static locally generated scenario only if the rules permit, labelled as backup and synthetic.

## 2. Three-minute narrative sequence (adapt to actual organizer timing)

**Scene 1 — Challenge in human terms.** "A parent has an 8 AM school drop-off, travels by scooter and owns only a fan. Air data is bad, money is limited, and no one has time to read research papers." Show **synthetic US AQI 355** with the explicit label. Explain this is a reproducible extreme-smog fixture, not Delhi live data.

**Scene 2 — Plan, not dashboard.** Select the family persona. Show the *next three moves* and **My Clean-Air Day** timeline. Show different steps for school/play, commute, home sources and fan. Point to one evidence link and one caveat.

**Scene 3 — Constraints change the answer.** Compare the existing household to a cyclist. Show the environmental upside but exposure/exertion caution. Switch to fixed shift or limited 15 minutes and show the numerical timing change disappears because source data are hourly. This is trustworthy inference.

**Scene 4 — Practical impact.** Compute e.g. 8 km one-way × 3 wholly avoided round trips = **48 vehicle-km not driven**, with its displacement assumption. Then enter a 15m² room and show approximate **190m³/h smoke CADR** and free/low-budget source actions. Explicitly state neither is a measured health or carbon result.

**Scene 5 — AI and community.** Ask: "I cannot move my school drop-off and I only have a fan. What could I do?" Show approved action IDs and mode if actually GenAI verified; otherwise say "this demonstration is rules-only; the structured provider integration still needs credentialed confirmation." Download anonymous community brief without child/family details.

**Scene 6 — Close.** "What makes this different is not pretending one AQI is a personal health measurement. It is explainable, feasible, verifiable actions for different lives under the same air." Show tests, file size and architecture only with actual measurements.

## 3. Judge evidence kit

Keep exact tested Git SHA, public repository URL, deployed HTTPS URL, current test command output, URL/source citations, reference PRD, code structure, schema contract and release signoff ready. Print or screenshot a simple trace: user input → normalized profile → allowed rule action → evidence link → optional LLM action ID → displayed approved advice. Do not show `.env` or a provider key.

## 4. Difficult questions with defensible answers

**"Is the AQI truly live and local?"** "Live mode requests a *regional modeled* Open-Meteo/Copernicus forecast and labels it US AQI; it is not official CPCB monitoring and we cannot promise a safer street. The demo scenario is explicitly synthetic."

**"How do you know the AI won't hallucinate?"** "It doesn't author user-facing environmental facts; it chooses 1–3 validated action IDs or abstains. The server formats approved advice and links. This reduces risk but independent adversarial review is still needed."

**"How much does avoiding a scooter trip improve Delhi AQI?"** "We don't know from this dataset. We can count vehicle-kilometers avoided under a stated substitution assumption; not regional AQI, CO₂ kg or personal disease reduction."

**"Why is a fan different from a purifier?"** "Airflow without a filter does not capture PM2.5. We recommend source control and discuss adequate particle filtration with EPA guidance."

**"Why does 15-minute schedule flexibility not provide an optimal departure?"** "The forecast is hourly; minute-level precision would be fabricated. A fixed or 15-minute shift gets alternate protective options instead."

**"Do you know GRAP Stage-IV is active?"** "We do not infer legal restrictions from AQI. We would need a dated official CAQM order; the prototype links authoritative resources but does not claim live stage tracking."

**"What did the GenAI actually do?"** "It selects relevant, preapproved actions or abstains; deterministic code enforces source/threshold/impact constraints. If a real provider call hasn't been staged successfully, we clearly disclose that."

**"Are you going to win?"** "We cannot predict the result. The submission aims to score well on demonstrable logic, transparent impact, security, tests, and real-world feasibility rather than quantity of features."

## 5. Rehearsal failure recovery

If live provider fails, switch visibly to the sample scenario and say the service is temporarily unavailable; never silently replace current data with sample. If GenAI is not available, show checked rules/fallback and disclose provider status. If a source link or chart fails, use the preverified documentation and avoid false success claims. Never sacrifice privacy/safety for dramatic demo effect.
