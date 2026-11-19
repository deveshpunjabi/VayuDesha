# AirWise v4 — Premium UI/UX Specification

**Doc ID AW-DESIGN-4.0.** This document describes the implemented visual foundation and the release-quality bar. It is not a claim that a third-party accessibility audit has passed.

## 1. Creative direction

**Product personality:** calm, trustworthy, scientific, human. **Mood:** modern environmental command center meets gentle family planner. **Not:** dystopian red pollution screens, gimmicky 3D planet, glassmorphism overload, fake AI controls, generic charts with no action.

**Color concept:** deep ink base with desaturated teal panels, soft mint for constructive actions, restrained orange/red solely to communicate genuine elevated pollution. Avoid using color as the sole meaning channel. Natural light typography and thin borders establish hierarchy; whitespace protects readability.

**Type:** system/UI sans (`ui-sans-serif`, Segoe UI fallback), with large editorial heading only for overview. No downloaded web fonts, no text-as-image. Approximate scale: H1 36–52px responsive, section H2 23–34px, cards H3 16–20px, body 14–16px in final accessibility pass, metadata 12–13px, captions 12px. **Known concern:** v3 includes several 10–11px labels; audit these for usability before release and increase where feasible.

## 2. Design token reference

| Token | Example currently implemented | Use |
|---|---|---|
| `--bg` | `#08141b` | shell background |
| `--card` | `#12252d` | surfaces |
| `--line` | `#29414a` | subtle boundaries |
| `--text` | `#eaf5ef` | primary foreground |
| `--sub` | `#8ea4aa` | secondary foreground—check contrast for smallest text |
| `--mint` | `#b7f0cf` | constructive/action accent |
| `--focus` | `#d1ed99` | visible keyboard focus |
| `--shadow` | `0 18px 65px #03101560` | restrained depth |

**Status tokens:** Good / Moderate / Unhealthy for sensitive groups / Unhealthy / Very Unhealthy / Hazardous / Unavailable are never only colors. Always show full label, US index and source.

## 3. Information architecture, priority order

1. **Skip link** and clear product identity, no unnecessary onboarding modal.
2. **City selector or conspicuous synthetic demo picker**, progress/error status.
3. **Source-labelled overview:** location, US AQI/category, model timestamp, PM2.5/PM10 and plain-language limitations.
4. **Your next three moves** before deep exploration; completed means "considered", never proven benefit.
5. **My Clean-Air Day** — central differentiating daily timeline with routine time, action, why, qualitative impact, cost/evidence, data age.
6. **Same air. Different lives.** Side-by-side machine-readable changes for one household constraint at a time.
7. **Decision lab** — how health protection and emissions/cost can disagree.
8. **Forecast and impact lab** — graph, compare time, CADR/room plan and avoided vehicle-km.
9. **Detailed action plan** — filter outdoor/home/travel/family.
10. **Community action** — anonymous message download.
11. **Ask AirWise** — evidence-locked AI mode + explicit fallback/abstention; no generic hallucinated tips.
12. **Transparency/legal/source footer** — source links, disclaimers, attribution.

**Implementation note:** Actual current page retains a forecast panel between overview and main routine. Changing the order is a P1 UI optimization gated by user testing, not a blocker to code correctness.

## 4. Responsive behavior

- Desktop 1280px+: sticky narrow sidebar, main two-column summary and concise card grids, body max-width 1700px.
- Tablet 768–1100px: sidebar becomes compact, core actions remain full width, no hidden source information.
- Phone 320/360/390px: profile collapsed, accessible `aria-expanded` toggle, horizontal navigation scrolls without page overflow, summary visible quickly, actions/decision cards single column, timeline stacked, no clipped labels.
- Touch targets aim for >=44×44 CSS pixels for primary controls; smaller metadata links must still be adequately spaced.
- Content should work at 200% zoom and dynamic text resizing, including form fields, timeline, and data notes.
- Prefer reduced motion: no animated critical content, no compulsory carousels, no aggressive parallax.
- Print mode: dark skin transforms to paper; evidence, caveats, routine and provenance must remain readable.

## 5. Component contracts

| Component | Required content | Empty/loading/error state |
|---|---|---|
| Location selector | Search text, city/country candidate, explicit selection | "No cities"; provider error without fake fallback |
| Simulation selector | `Unhealthy 183`, `Hazardous 355`, `Moderate 77`, `Unavailable` labels | Always prominent synthetic banner |
| AQI hero | full index name, source, time, number, unit | dashes + "unavailable" not zero |
| Decision headline | one relevant, achievable action | "Check official reporting" when missing |
| Daily timeline | time, activity, title, why, evidence, limits, cost, impact kind | "No routine available"; never generated appointments |
| Scenario comparison | change, before/after actions and changed fields | explicitly say "no change" when equivalent |
| Choice card | protection/exposure, emissions, cost, limitations | no ranking without data |
| Clean-air room | area, source, fan/purifier/budget, CADR, actions | validate 4–200m²; display actionable error |
| Chat | mode label, user question, approved response, relevant citations | out-of-domain abstention; provider fallback |
| Exports | source, index, model timestamp, simulation label, actions/limits | disabled until loaded; no PII community export |

## 6. Accessibility release requirements

Target **WCAG 2.2 AA**, not "certified WCAG" until measured. Semantic HTML, explicit input labels, real buttons, `aria-live` updates without flooding, chart summary in adjacent prose, keyboard-only full journey, visible focus outline, 4.5:1 text contrast target for normal text, 3:1 large text/UI element target, sufficient touch sizes, zoom/reflow, no essential information in icons/colors alone. Test assistive technology names and roles; custom chart tooltips must not be the only way to access values.

**Manual QA sequence:** Tab from skip link through city search, choose sample, change household input, run room planner, compare scenarios, send question, download brief and community brief, clear saved profile; ensure focus remains logical in error/success states. Repeat at 320px, 390px and 200% zoom. Do not call this passed until a real browser, keyboard and screen-reader check is recorded.

## 7. Premium interactions (subtle, functional)

- Profile choice updates the daily plan after request completion and cancels outdated visual responses via a request ID.
- Changed persona is clearly explained rather than silently re-ranking card positions.
- High pollution gets higher visual attention through full text labels, not giant red gradients.
- All numerical comparisons show units and assumptions, not fireworks/celebratory percentages.
- A completed checklist shows "considered", not "health improved".
- AI mode distinguishes "GENAI-SELECTED", "RULES FALLBACK" and "RULE-BASED"; never call configuration "working" without live test.
- Link styles remain obviously interactive; no inert CTA or decorative fake button.

## 8. Design QA blocking conditions

A release is blocked if: mobile horizontal overflow hides primary actions, focus is invisible, chat shows arbitrary unverified model text, sample label is missing, US AQI is displayed as CPCB India AQI, an active GRAP notice is fabricated, a calculated "safe" hour is shown for fixed schedules, or text is illegible at realistic phone size.

**Review artifact:** two actual browser screenshots (desktop, 390px), a keyboard test record, a zoom test record, and at least one human accessibility check. Prior reference screenshots are not proof of this v4 build.
