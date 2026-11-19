# AirWise v4 — Instructions for Coding Agents

**Read before editing** `README.md`, `PROJECT_STATUS.md`, `docs/01_PRODUCT_REQUIREMENTS_PRD.md`, `docs/02_ARCHITECTURE_TECH_STACK_API.md`, `docs/04_EVIDENCE_SCIENCE_SAFETY.md`, and `docs/06_CODING_AGENT_MASTER_PROMPT.md`.

- Work on the actual source. First run `npm test` and `npm run check:size`; reproduce defects with tests.
- Preserve Node 22 + vanilla HTML/JS/CSS + no runtime NPM dependency as the default. Make no gratuitous framework rebuild.
- Every visible environmental number must identify **US AQI** and source type (`model` vs `simulation`), never claim CPCB India or observed station without authorized integration.
- No invented exposure, health-risk percentage, street-level safe route, active GRAP order, personal CO₂ saving or fan filtration.
- AI selects 1–3 approved action IDs or abstains; no raw LLM health prose; server keeps the API key. Handle provider errors truthfully.
- Do not silently override necessary school/work schedules; 15-minute shifts cannot be evaluated from hourly forecasts.
- Make actual working, accessible controls; no inert CTA. Never use untrusted content as `innerHTML`.
- After edits run tests and static checks, record REAL/MOCK/NOT TESTED provider proof, and update PRD/status/task log. Do not assert browser accessibility or public deployment without doing them.
- Strict challenge constraints: one GitHub branch only, public repo, <10MB including Git history, README+complete code, max three submission attempts. Do not submit or publish without user authorization.
- Prefer honest partial completion to unsupported success claims.

Detailed workflow, non-goals and phase gates: `docs/06_CODING_AGENT_MASTER_PROMPT.md`.
