# AirWise v4 — Test Strategy, Acceptance Matrix and Release Gates

**Doc AW-QA-4.0.** Local automated tests are necessary, never sufficient for public operational claims.

## 1. Verification classification

- **AUTOMATED PASS:** Ran `npm test` in this exact source state and the test passed. Does not prove real external service or browser behavior.
- **MOCKED PASS:** An HTTP or model function used a stub/synthetic fixture. Validates logic, not provider availability.
- **REAL PASS:** External provider or deployed browser request executed with real credentials/data and recorded sanitized response/URL/time.
- **MANUAL PASS:** Human reviewer records device, screen width, accessibility/safety verdict and timestamp.
- **UNKNOWN:** Not checked. **FAIL:** Known defective. P0 release requires no UNKNOWN/FAIL.

## 2. Automated coverage already included

`tests/decisions.test.mjs` — US AQI boundaries, conservative high-smog activity, invalid inputs, timing comparisons, CADR/vehicle-km. `tests/air.test.mjs` — coordinate, normalized forecast, timestamps and prompt safeguards. `tests/choices.test.mjs`, `tests/compare.test.mjs` — low-emission tradeoffs and same-air persona changes. `tests/ai.test.mjs` — schema/allowlist, refusal, emergency, provider outage mocked. `tests/server.test.mjs` — healthy HTTP, security headers, bad content types, CORS/origin checks, route behavior. `tests/ui-integrity.test.mjs` — page DOM ID integrity and simulation labeling. `tests/v4.test.mjs` — new fan/schedule, four synthetic scenarios, daily routine, anonymized community, evidence, AI abstention, room helper and HTTP v4 contracts.

**Recorded local run:** `npm test` → 71 tests passed, zero failed; rerun before packaging. **No real OpenAI provider key or external browser accessibility test is implied by this count.**

## 3. Mandatory manual and integrated acceptance matrix

| ID | Scenario / action | Expected result | Verification needed |
|---|---|---|---|
| T-01 | Clean unzip then `npm test` | all green, no dependency install | automated clean extract |
| T-02 | `npm run check:size` | source <9MiB safety threshold | automated |
| T-03 | Server `npm start` | HTTP health 200 | HTTP real local |
| T-04 | Open `/` | real page and styles load | browser real |
| T-05 | Search Delhi via provider | selectable India location | external real |
| T-06 | Search Mumbai | selectable India location | external real |
| T-07 | Search unknown spelling | honest empty/error message | external/manual |
| T-08 | City switch during request | old response never overwrites current city | browser/manual |
| T-09 | Refresh provider | model time, source and U.S. AQI shown | external real |
| T-10 | Stale/missing provider timestamp | no stale claim | automated + external failure simulation |
| T-11 | U.S. AQI 183 sample | conspicuous simulation, unhealthy category | automated/browser |
| T-12 | U.S. AQI 355 sample | hazardous, no strenuous activity promoted | automated/browser |
| T-13 | US AQI 77 sample | moderate scenario, no catastrophic message | automated/browser |
| T-14 | Missing data sample | no "clean air" inference | automated/browser |
| T-15 | Parent vs no child | school/play action appears/disappears | automated/browser |
| T-16 | Fan vs none | fan-specific warning, not filter claim | automated/browser |
| T-17 | Purifier present | maintenance/CADR guidance | automated/browser |
| T-18 | Budget free vs flexible | no forced purchase if free | automated/browser |
| T-19 | Fixed shift | no shift recommendation | automated/browser |
| T-20 | Limited 15min | no fake hourly/15min PM advantage | automated/browser |
| T-21 | Flexible 120min | only eligible same-day forecast alternatives | automated/browser |
| T-22 | Max shift manually capped | cap never exceeds schedule class | automated/browser |
| T-23 | Routine items | 3–6 steps, times + sources + limits | automated/browser |
| T-24 | Edit cooking hour | routine hour changes | browser/manual |
| T-25 | Edit play/exercise hour | child routine hour changes | browser/manual |
| T-26 | Same-air scenario proof | changed fields and real adapted actions | automated/browser |
| T-27 | Cycling under smog | balanced emissions/exertion warning | automated/human safety review |
| T-28 | Vehicle-km input 8km ×3 | 48 vehicle-km not driven | automated/browser |
| T-29 | Invalid travel-mode or trips | 400 and no impact claim | automated/browser |
| T-30 | CADR 15m² | 190m³/h estimate, assumption | automated/browser |
| T-31 | Room with fan/cooking | fan-not-filter and cooking-source guidance | automated/browser |
| T-32 | Room purifier/dust | fit equipment and damp-cleaning | automated/browser |
| T-33 | Room invalid area | validation error, no fake result | automated/browser |
| T-34 | Routine export | includes source/time and caveats | browser/manual |
| T-35 | Community export | no PII/profile, simulation flag if sample | automated/browser |
| T-36 | Printed report | legible on paper, source and caveats | browser/manual |
| T-37 | Chat without key | clearly labelled rules mode | automated/browser |
| T-38 | Chat with key | real schema response, GENAI badge only if successful | **real external required** |
| T-39 | Chat provider outage | checked fallback, no raw model answer | mocked + real staging |
| T-40 | Model returns unknown action ID | rejected/fallback | automated |
| T-41 | Model returns irrelevant off-topic status | no nearest forced action | automated + real staging |
| T-42 | Severe breathing emergency | local emergency help; no LLM request | automated + human |
| T-43 | Prompt injection into question | approved IDs/abstention only | adversarial human |
| T-44 | Question with child's name | warning; no server DB storage | privacy review |
| T-45 | UI 320px | zero clipped action controls | browser real |
| T-46 | UI 360px and 390px | no horizontal body overflow | browser real |
| T-47 | 200% zoom | usable text/controls with reflow | browser real |
| T-48 | Keyboard tab-only | proper focus and every control works | human manual |
| T-49 | Screen reader | labels, status updates, chart summary | human/manual |
| T-50 | Reduced motion | no essential animated-only content | browser real |
| T-51 | Contrast audit | normal text >=4.5:1 target, nontext >=3:1 where applicable | accessibility tool/human |
| T-52 | Security headers/CSP | same-origin restrictions, no inline script | automated + production |
| T-53 | Origin spoof / content-type bad | rejected POST | automated |
| T-54 | API limit/concurrent AI calls | bounded and graceful response | staging load |
| T-55 | Real API key stored server | no key in JS/HTML/git/log | security scan |
| T-56 | External source links | official and relevant; no broken links | manual hyperlink check |
| T-57 | Git public/one branch | exactly one branch remote | git/GitHub verification |
| T-58 | Git history + source below 10MB | size verified after final push | git/GitHub verification |
| T-59 | Clean clone of public main | `npm test`, `npm start` | external independent clone |
| T-60 | Official attempts instruction | submission authorized and count understood | organizer direct |

## 4. Test data matrix

| Fixture | Current U.S. AQI | Purpose | Expected guiding behavior |
|---|---:|---|---|
| `unhealthy` | 183 | normal hackathon parent demo | avoid prolonged exertion, indoor source control |
| `hazardous` | 355 | worst-case severe winter smog | stronger optional outdoor exertion precautions |
| `moderate` | 77 | no alarmist output | tailored moderate caution; source still model/sample |
| `unavailable` | null | API outage simulation | no false zero, official local reporting prompted |

Every fixture is clearly synthetic and uses a dynamically generated timestamp. An outage mode is **not** proof the live provider is down at the user's city.

## 5. Adversarial AI checklist (manual staging)

Ask 15 varied prompts spanning: prompt injection, nonexistent active GRAP order, unrealistic 15-minute shift, medication advice, severe symptoms, percentage saved, zero-cost fan, cycling despite hazardous pollution, absent source, unknown city, unsupported politics/stock request, malformed JSON, empty response, provider timeout, repeated-cost exhaustion. For each, log timestamp, mode/status, action IDs, safety judgment, screenshots if useful, and any code patch required. Do not record names/health histories.

## 6. Release signoff table

| Gate | Requirement | Status as of package build |
|---|---|---|
| Code | unit + HTTP tests, size, clean archive | LOCAL PASS (rerun required) |
| Science | accurate source and no fabricated impact | source/logic tested; HUMAN REVIEW PENDING |
| GenAI | real provider, schema, fallback, spend cap | MOCK TESTED; REAL NOT VERIFIED |
| Data | real provider on deployment, source index/time | MOCK TESTED; REAL NOT VERIFIED |
| Accessibility | keyboard, screen reader, zoom, contrast, mobile | NOT VERIFIED |
| Hosting | public HTTPS and independent browser | NOT VERIFIED |
| Submission | public main only, under 10MB incl Git history, portal guide | NOT VERIFIED |

**Do not downgrade an UNKNOWN to PASS because another tool generated a plausible-looking screenshot or test transcript.**
