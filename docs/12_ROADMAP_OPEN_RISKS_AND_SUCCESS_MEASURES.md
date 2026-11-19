# AirWise v4 — What Is Left, Future Roadmap and Decision Log

**Doc AW-RISK-4.0.** No claim of production certification or contest victory.

## 1. What is implemented and locally tested

- Node.js app with source-only package, static routes, CI workflow, source-size guard.
- City lookup/model adapter code; timestamp/source/US AQI labels; deliberate synthetic scenarios.
- Family/extra-care, commute, budget, fan/purifier, daily times, schedule flexibility normalized.
- Rule-based safety recommendations, evidence registry, 3–6 step My Clean-Air Day timeline, scenario proof, trade-off choice cards.
- Optional evidence-locked GenAI selection with `status`/action IDs and checked fallback/abstention.
- Room planner + CADR, motorized trip distance, forecast PM2.5 comparison, community playbook, anonymous export and print.
- Native unit+HTTP integration tests, error handling, simple CSP and limits.

## 2. What is NOT proven by local tests

1. Actual Open-Meteo request success and city coverage on the eventual hosting provider.
2. Actual credentialed model request, billable token expenditure, semantic safe alignment and interruption behavior.
3. Independent browser rendering (Chromium headless did not complete screenshot in current restricted environment).
4. WCAG 2.2 AA audit, human-reviewed English/Hindi safe text, keyboard/screen-reader acceptance.
5. All source links relevant and reachable on public host at launch; external dependency licenses and publisher changes.
6. GitHub public visibility, exactly one remote branch, source **plus Git history** below 10MB, clean clone.
7. Official detailed organizer portal rules and three-attempt interpretation.
8. Distributed production rate limits, operational monitoring, high request concurrency and provider hard spend cap.
9. Any official Indian observed CPCB feed or dated CAQM GRAP order ingestion.

## 3. Three release waves

**Wave A — credible submit-ready candidate:** finish real credentialed provider validation, independent HTTPS deployment, five persona walkthroughs, safety/human review, contrast/keyboard/mobile checks, clean single-branch repository, and exact organizer guide check.

**Wave B — strong India-specific extension (only if time and licensing):** separate observed/forecast providers, official CPCB local AQI adapter and metadata, dated CAQM advisory feed for Delhi-NCR (with explicit active order), reviewed Hindi UI. Never pretend these exist because links are present.

**Wave C — post-hackathon product:** opt-in alerts, optional sensor readings, clear provenance/confidence visualization, reviewed regional translations, accessibility and privacy monitoring, consented community collaboration, and emissions factors with measured/validated assumptions.

## 4. No-go ideas without research

"Safe streets map," "your child's disease risk fell 40%," "fan cleans PM2.5," "we reduced city AQI by X," "GRAP IV is active based on our reading," "AI prediction beats CPCB," and "our model is 100% accurate." These are not v4 features and should not appear in marketing.

## 5. Evidence of value if user research becomes possible

Ask 5–10 volunteers to perform parent/cyclist/fixed-shift/fan-only/community tasks; observe whether they (a) understand the source and AQI index, (b) can find three feasible steps, (c) understand an indoor fan limitation, (d) can distinguish PM forecast from personal dose, (e) can complete the desired action without support, and (f) can explain why the recommendations changed. Record qualitative outcomes, not fake statistical significance.

## 6. Decision log

- **D001** Keep dependency-free Node and native frontend for small, reproducible repo.
- **D002** Use U.S. AQI with clear labels instead of incorrect Indian scale relabeling.
- **D003** Hourly forecast cannot substantiate a 15-minute optimal shift.
- **D004** Never claim quantified health benefit/CO₂ without measured model inputs.
- **D005** AI chooses approved action IDs or abstains; server authors health/evidence text.
- **D006** Keep community export anonymous; no household profile in downloaded brief.
- **D007** Keep synthetic demo states conspicuous to support offline judging without fabricating live conditions.
- **D008** No external India observed-station integration without licensed authoritative source.
- **D009** No automatic contest submission or extra branches without explicit user authorization.

## 7. Release status and honesty

Treat this project as a **national hackathon candidate in validation**, not an independently certified public service. The strongest competition advantage is the traceable decision experience; more features will not compensate for unverified GenAI or an inaccessible public demo.
