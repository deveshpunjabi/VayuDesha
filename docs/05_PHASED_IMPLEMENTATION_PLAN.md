# AirWise v4 — Phased Implementation Plan & Delivery Gates

**Doc ID AW-PLAN-4.0.** Read together with `TASK_BACKLOG.csv`. The plan distinguishes **local implementation** from **release verification**. No phase is automatically complete merely because source code exists. Avoid spending the organizer's limited attempts on unverified demonstrations.

## Release rules applying to every task

- A P0 ticket is complete only when its tests pass, screenshots/user journey are reviewed if UI-affecting, links/evidence are valid, limitations are documented, and the project still meets the under-10MB constraint.
- Change one architectural area at a time, run focused tests then entire `npm test`, update contract docs and source list.
- Do not add dependencies unless they solve a measured requirement. If added, ensure license/lockfile, vulnerability audit, size budget and reproducible clean install.
- No claims of live data, running GRAP orders, personal medical effect, emissions factors or production support without independent verification.
- A coding agent must return a diff summary, commands run, passed/failed results, screenshots only when actually generated, and open blockers at the end of each phase.

## Phase 0 — Contest compliance & baseline (P0)

**Goal:** ensure this is the right vertical and the right submission format before investing in polishing.

| Ticket | Task | Status | Acceptance |
|---|---|---|---|
| AW-001 | Capture verbatim Challenge 6 and all judge dimensions | DONE | PRD clause matrix exists |
| AW-002 | Verify local Node/Git/GitHub/AI platform prerequisites | PARTIAL | Node verified; GitHub and approved platform must be checked on user's machine |
| AW-003 | Confirm organizer three-attempt semantics and submission portal guide | BLOCKED | Official document reviewed and recorded |
| AW-004 | Inventory v3, run existing test suite | DONE | Baseline 58 passed before edits |
| AW-005 | Establish source-only size cap and no-secrets packaging | DONE locally | `npm run check:size`; Git history still needs remote check |

**Gate 0:** No first submission attempt until AW-003 and AW-002 external checks pass. Git commit on `main` is okay; don't create a second branch.

## Phase 1 — Safety, source truth and personalization (P0)

| Ticket | Task | Status | Acceptance |
|---|---|---|---|
| AW-101 | Reproduce fan/no-fan recommendation defect | DONE | Regression test demonstrates difference |
| AW-102 | Add fan-specific evidence-based advice | DONE | No claims unfiltered fan removes PM2.5 |
| AW-103 | Normalize maximum shift by schedule | DONE | Fixed 0, limited 15, flexible ≤120 minutes |
| AW-104 | Restrict forecast comparisons to feasible same-day hours | DONE | No numerical sub-hour interpolation |
| AW-105 | Include flexible-time limit notice | DONE | UI explains why no alternate time exists |
| AW-106 | Curate source/claim evidence registry | DONE | Official claim-specific URLs and evidence tests |
| AW-107 | Label simulated vs model data and timestamps | DONE | Four synthetic modes, model source and time |
| AW-108 | Independent science review of all health/air claims | TO DO | Human signoff; tests alone do not prove science |

**Gate 1:** Fan and timing regression tests green; public claims reviewed; no silent U.S./India AQI relabeling.

## Phase 2 — Flagship product flow: My Clean-Air Day (P0)

| Ticket | Task | Status | Acceptance |
|---|---|---|---|
| AW-201 | Define normalized daily profile and optional fields | DONE | `usualHour`, `outdoorHour`, `cookingHour`, `maxShiftMinutes` |
| AW-202 | Implement 3–6 step routine generator | DONE | Typed `routine` with time/activity/reason/impact/cost/source/limitations |
| AW-203 | Connect routine to main dashboard | DONE | Visible source-labelled responsive timeline |
| AW-204 | Add personal export with routine and provenance | DONE | `.txt` and print include routine and caveats |
| AW-205 | Compare five personas at same synthetic AQI | PARTIAL | Automated cases; human walkthrough pending |
| AW-206 | Audit 320/360/390px reflow and 200% zoom | TO DO | Real-browser screenshots and keyboard testing |
| AW-207 | Validate exactly required arrival times and shifting multi-hour obligations | BACKLOG | Current hourly capped shift is approximate and honest |

**Gate 2:** A parent, cyclist, shift worker, fan-only household and community organizer receive meaningfully different usable outputs; no invented safety window.

## Phase 3 — GenAI: visible intelligence under evidence constraints (P0)

| Ticket | Task | Status | Acceptance |
|---|---|---|---|
| AW-301 | Define supported / clarify / unsupported / emergency | DONE | Local router tests |
| AW-302 | Add model status and verified action-ID schema | DONE | 1–3 allowlisted IDs for supported, 0 otherwise |
| AW-303 | Compose all factual answers server-side | DONE | No raw LLM prose reaches users |
| AW-304 | Fallback on invalid model JSON, refusal, timeout | DONE | Mock tests and explicit fallback mode |
| AW-305 | Add local in-memory daily AI cap and concurrency bound | DONE prototype | Production-wide cost cap still required |
| AW-306 | Perform one real credentialed model call in staging | BLOCKED | Requires the user's valid API key and deployment; record sanitized evidence |
| AW-307 | Adversarial safety evaluation with human review | TO DO | At least 15 prompt-injection, off-topic and high-risk cases |
| AW-308 | Implement provider-cost and usage monitoring across instances | TO DO for scale | Redis/host counters or provider budget when moving beyond one instance |

**Gate 3:** No live-GenAI badge or judge claim until AW-306 is confirmed. Rules-only demonstration is valid as a *fallback*, not proof that the core GenAI requirement was fulfilled.

## Phase 4 — Practical impact, indoor household & community (P1)

| Ticket | Task | Status | Acceptance |
|---|---|---|---|
| AW-401 | PM2.5 forecast delta in µg/m³ only | DONE | No personal inhaled-dose claim |
| AW-402 | Vehicle-km calculation with full displacement assumption | DONE | Not CO₂ automatically |
| AW-403 | Smoke CADR metric calculator and limits | DONE | EPA rule, 4–200m² validation |
| AW-404 | Budget+home+source-aware clean-air room planner | DONE | Fan and purifier differ, no fixed percent |
| AW-405 | Anonymous school/workplace/housing brief | DONE | Household fields absent from export |
| AW-406 | Verify exports from an actual mobile browser | TO DO | Download, print, accessibility and privacy checked |
| AW-407 | Add India-specific observed station adapter | OPTIONAL / BLOCKED | Licensed data + validated scale/averaging methodology |
| AW-408 | Add dated CAQM GRAP order linking | OPTIONAL / BLOCKED | Official source with order number and active status |
| AW-409 | Add local-language translations | OPTIONAL / BLOCKED | Human-reviewed medical/safety translation |

**Gate 4:** Measurement, estimate, qualitative claim and conjecture are visually and semantically distinct. There is no fabricated measured impact.

## Phase 5 — Engineering, security, quality (P0)

| Ticket | Task | Status | Acceptance |
|---|---|---|---|
| AW-501 | Unit + HTTP integration tests | DONE | Current `npm test` counts documented |
| AW-502 | Invalid JSON/city/location and stale-data handling | DONE | Structured 400/503 and safe fallback |
| AW-503 | CSP, static allowlist, text-node rendering | DONE | Header and UI integrity tests |
| AW-504 | Check for exposed API keys and binary bloat | DONE locally | `.env` excluded, zip audited, Git history still required |
| AW-505 | Real browser e2e and screenshot smoke | NOT VERIFIED | Headless Chromium failed in this environment; use external runner |
| AW-506 | Keyboard, screen reader and contrast review | TO DO | WCAG 2.2 AA target; record gaps/fixes |
| AW-507 | Production proxy/rate-limit/security review | TO DO | No unbounded in-memory keys or misread shared proxy IPs |
| AW-508 | External provider resilience and real fetch test | BLOCKED | Valid live provider network, city time and outage tested on host |
| AW-509 | Performance/CLS/resource budget verification | TO DO | Lighthouse/browser run on hosted build |

**Gate 5:** CI green, accessibility/manual QA recorded, real host handles requests, no exposed secrets, no untested claims.

## Phase 6 — Presentation, submission, post-evaluation (P0)

| Ticket | Task | Status | Acceptance |
|---|---|---|---|
| AW-601 | README and docs consistent with source | DONE | v4 docs single source of truth |
| AW-602 | Demo walkthrough with four synthetic states | DONE script | Human rehearsal required |
| AW-603 | Deploy public HTTPS app | BLOCKED | Reachable from independent browser |
| AW-604 | Public single-branch GitHub repo and history size | BLOCKED | `main` only, public, under 10MB, clean clone verified |
| AW-605 | Official organizer submission attempt review | BLOCKED | Confirm portal, count usage and format |
| AW-606 | Final release checklist signed by team | TO DO | All P0 gates `PASS`, not `UNKNOWN` |

**Gate 6:** Do not submit while any blocker remains. Submit exact tested commit, not a later untested branch or local-only ZIP.

## Phase order and scope reduction if running short

**Essential story:** Real/model-labelled data or conspicuous demo, editable household, actually feasible daily plan, evidence and tradeoffs, live-tested AI action selection, basic room and community action, clear failure state, accessible UI, public repository. **Cut first:** local language, external CPCB integration, notifications, accounts, branded animations, map/geofence, emissions-factor estimates. **Never cut:** safety/provenance, README, tests, one-branch requirement, mobile usability.

## Definition of Done — every issue

- Requirement reproduced or stated as one user outcome.
- Code and tests exist, nonfunctional controls removed.
- Scientific/provider claims include proper source, units and limitations.
- Keyboard/phone consequences tested for UI changes.
- No secret, history-size or dependency regression.
- `README`, PRD/status, API contract and task inventory updated.
- Reviewer can verify behavior without relying on a model-generated claim of completion.
