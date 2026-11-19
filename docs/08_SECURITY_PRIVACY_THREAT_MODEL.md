# AirWise v4 — Security & Privacy Threat Model

**Doc AW-SEC-4.0.** Focus: safe demo design; public production usage requires a separate deployment-specific assessment.

## 1. Assets

- User's voluntarily selected household context (children flag, general need for extra precautions, travel mode, budget, equipment and hours)
- City-level geocode (not home address)
- AI API key held only in server environment
- External provider availability, model result, attribution, honest outputs
- Compute/AI quota and public web server availability
- Browser localStorage preferences and checklist IDs

## 2. Trust boundaries / attacks / controls

| Boundary | Threat | Current mitigation | Residual risk / follow-up |
|---|---|---|---|
| Browser → HTTP POST | invalid/oversized body, CSRF | JSON type/size, same-origin header when present | Origin absent is allowed; reverse proxy/host policy must be reviewed |
| Browser → API | abusive repeated calls | per-process per-IP quotas, chat stricter | multi-instance bypass and memory-map DoS; use distributed counter on real scale |
| Open-Meteo → parser | stale/garbled data | shape, timestamp, coords and numeric checks | geographic coverage accuracy and provider outages need real tests |
| User question → model | prompt injection, data exfiltration | trusted instructions, tightly bounded context, schema and allowlist | semantic ranking not formally safe; adversarial review needed |
| Model → UI | hallucinated health, links, measures | server-authored approved actions, no raw model text | approved sources can be misapplied; human evidence audit needed |
| Browser DOM | XSS through provider city/question | `textContent`, created DOM nodes; static CSP | ongoing manual review and CSP report-only telemetry if deployed |
| Static routes | path traversal | exact static-file allowlist | verify host proxy does not override routes |
| Server env | key disclosure | server-only key, `.env` gitignore | secret scanners/history/host log handling necessary |
| Export | household PII leakage | generic community source/AQI/actions only | verify output and location semantics on actual UI |
| Browser saved state | shared-device privacy | local only and clear button | shared profiles visible until cleared; clarify in privacy notice |

## 3. Privacy specification

No compulsory login, database or analytics tracker. Saved preferences and checklist stay in browser localStorage. Query text is sent to app server and may be transmitted to configured AI provider; `store:false` is requested, but that is not a comprehensive claim about provider/hosting retention or safety for sensitive information. Users should be told not to enter names, exact addresses, detailed health conditions or school identities. The app should have a functional clear-screen and clear-local button. Export for community must omit individual profile and health flags; do not publish "my family plan" automatically.

## 4. Operational controls for release

- Set server `OPENAI_API_KEY`, `OPENAI_MODEL`, `AI_DAILY_REQUEST_CAP` in host secret manager; never hardcode.
- Restrict public AI usage; enforce provider-level hard budget/spending controls, not only per-process memory quota.
- Use TLS/HTTPS termination with correct forwarding, host allowlist and expected Origin protocol.
- Add request ID and minimal error logs **without raw chat prompts or location finer than city**; cap map sizes and avoid unbounded caches.
- Keep dependency-free source; if deps added, lock versions and audit licenses/vulnerabilities.
- Verify CORS intentionally disabled; do not set wide `Access-Control-Allow-Origin:*` for stateful endpoints.
- Monitor provider errors/latency and data age; ensure safety logic fails closed.
- Scan source **and Git history** for secrets before making the repo public.
- Check license and required provider attribution (Open-Meteo / Copernicus CAMS, location names GeoNames); free API noncommercial terms must be respected.

## 5. Known shortcomings to state transparently

This is an educational hackathon candidate. It does not have full distributed rate limiting, identity/auth, DDoS protection, incident response, audited emergency content, multiple-provider service guarantees, formal privacy impact assessment, independently measured accessibility, or real provider contract verification in this environment. Those are open tasks, not features to claim.
