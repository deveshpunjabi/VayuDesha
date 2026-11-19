# AirWise v4 — Deployment, GitHub & Contest Submission Runbook

**Doc AW-OPS-4.0.** Do not claim the public repo or deployment exists until personally verified. Organizer's full submission-guide link is not included in the user's supplied text; obtain it before using an attempt.

## 1. Prerequisites

- Node.js 22 and npm; Git installed/configured; active GitHub account authorized to create a **public** repository.
- Approved AI platform downloaded/configured if the organizer mandates a particular platform. Read official hackathon rules about which platform is acceptable; no assumption that ChatGPT alone qualifies.
- For true GenAI demo, OpenAI API account/budget + server-side `OPENAI_API_KEY`; the user must create/provide key via host secrets, not paste publicly.
- Hosting platform supporting Node 22 HTTP server and HTTPS reverse proxy. Persistent disk not required, but host must keep process alive while judging.
- Free/noncommercial Open-Meteo use and attribution confirmed; for commercial deployment obtain appropriate access.

## 2. Run locally after extraction

```bash
node --version                 # expect 22.x or compatible >=20.10
npm test                       # no external package install required
npm run check:size             # source-only measure, not full Git pack size
npm start                      # default PORT=3000
```

Visit `http://localhost:3000`, select synthetic scenario and family profile. The app works without any external key in rules-only demo. **Do not describe this mode as a real GenAI response.**

If you have a key, copy `.env.example` to `.env` locally and set `OPENAI_API_KEY` there (never commit or share the file). On supported Node, run `npm run start:ai` or configure host environment. Use `AI_DAILY_REQUEST_CAP` as a *local per-process guard*, not a durable production budget.

## 3. Safe GitHub creation, ONE branch only

Use a new empty repository with no initialized README/license from GitHub (local repo already contains these). Then:

```bash
git init -b main
git add .
git status --short
git diff --cached --stat
git commit -m "Release AirWise v4 validated candidate"
git remote add origin https://github.com/<YOUR_ACCOUNT>/<YOUR_REPO>.git
git push -u origin main
```

Replace placeholders with the actual authorized public account/repo. Do not use template forks with extra branches, generated release branches or CI branches. Confirm public visibility in an incognito browser. Explicitly verify branch list:

```bash
git branch --list
git ls-remote --heads origin
git count-objects -v
find . -maxdepth 2 -type f -size +2M -print
```

The challenge says **repository size under 10 MB**, not only a ZIP or working tree size. Validate Git packed object/history size and GitHub's reported repository size; avoid committing giant binary assets even temporarily. If the repo has contaminated history, safest approach is a new clean repository initialized from current reviewed source, not a risky history rewrite after publishing. **Do not use multiple branches to repair history.**

## 4. Deploy (host-agnostic)

Use build command empty or `npm test`, start command `npm start`, runtime Node 22, environment `PORT` provided by host. Set `OPENAI_API_KEY`, `OPENAI_MODEL`, `AI_DAILY_REQUEST_CAP` as *server secrets* only if GenAI needed. Enable HTTPS, correct origin/host behavior, restart policy, startup probe `/api/health`, appropriate provider egress. Add WAF/edge rate limit and provider spending budget for public traffic.

Once hosted, independently test `/`, `/api/health`, `/api/cities?q=Delhi`, a live `/api/plan` with authorized city coords, `/api/scenarios`, `/api/demo?scenario=hazardous`, `/api/room-plan`, a valid supported AI question using real key, and backup rules mode. Record status/date/time, never secret or personally identifying prompts.

## 5. External-provider verification record template

| Check | Real/Mock/Unknown | Timestamp | Sanitized result | Reviewer |
|---|---|---|---|---|
| Open-Meteo geocode Delhi | UNKNOWN | — | — | — |
| Open-Meteo modeled US AQI for India | UNKNOWN | — | — | — |
| Timestamp age, source and index | UNKNOWN | — | — | — |
| Genuine OpenAI JSON schema model response | UNKNOWN | — | — | — |
| Failed model/fallback on public host | UNKNOWN | — | — | — |
| Browser mobile 390px and keyboard | UNKNOWN | — | — | — |
| Public HTTPS app independent access | UNKNOWN | — | — | — |

## 6. Clean clone signoff

After push, test from a new folder *not* your current working copy:

```bash
git clone --single-branch --branch main https://github.com/<YOUR_ACCOUNT>/<YOUR_REPO>.git airwise-clean-check
cd airwise-clean-check
npm test
npm run check:size
npm start
```

Do not assume local untracked files are present in the public clone. Verify `.env` is absent, API responses work in fallback and HTML/CSS/JS are served.

## 7. README minimum required by organizer

- Chosen vertical: Challenge 6 Urban Air Quality Assistant.
- Problem, intended users, approach and decision logic.
- Main features and exact implemented/non-implemented states.
- Architecture, tech stack, module responsibilities.
- Setup, env keys, sample mode, tests and usage.
- Assumptions, scientific limitations, data provider attribution and privacy.
- Demo walkthrough, public deployed URL (only when real), team/project info if required.
- License and any code attribution.

## 8. Final submission stop/go

**STOP** if any of these remain unknown: official meaning of three attempts, actual public URL, exact single remote branch, <10 MB full remote repo, clean clone test, real provider reliability, real GenAI call, critical safety and mobile accessibility review. An organizer may allow a partial prototype, but do not claim complete verification.

**GO** when all P0 gates are signed off and the exact tested commit hash matches the public repository and deployment. Record time and submitted links without exposing credentials.

## 9. Contingency plans

- **Air provider down:** show no current live values, link official guidance, offer labelled synthetic demo only with deliberate user action.
- **AI quota/key unavailable:** show rules-only or fallback mode; do not use mock responses in a live-GenAI claim.
- **Public host restarts:** Node process should recover; client supports reselect/reload; browser preferences persist per device if storage enabled.
- **Broken evidence link:** replace only with matching primary source, update registry/test/docs, rerun review.
- **Repository above cap:** eliminate binaries/dependency folders and recreate clean main repository before final push; do not submit an over-limit link.
