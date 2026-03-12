# Migration Context — 2026-03-12

## What Was Done This Session

### 1. Epic Solver Rewrites (all in `src/cli/agents/`)

All 6 epic/story solver agents were rewritten to add a **"Commit to Decisions"** principle and **score-band priority actions**. This was the primary work of the prior session (continued here).

#### Files updated:

| File | Key Change |
|------|-----------|
| `solver-story-solution-architect.md` | Added `Score 60-78` band with 6 steps for auth protocol stories (state machine ACs, all numeric auth values, endpoint contracts, pre-auth mechanism, cross-cutting constants, authorization per endpoint) |
| `solver-epic-security.md` | Full rewrite — added Commit to Decisions + score bands 60-78/79-88/89-94 with concrete steps (token storage, CSRF strategy, rate limit thresholds, trust boundary matrix, session revocation, audit logging) |
| `solver-epic-backend.md` | Full rewrite — added Commit to Decisions + score bands (transaction boundaries, schema entities, cleanup/retention rules, concurrency control, ORM/migration tooling) |
| `solver-epic-frontend.md` | Full rewrite — added Commit to Decisions + score bands (async state management, HTTP error handling per status code, route protection, accessibility baseline, component/design system) |
| `solver-epic-api.md` | Full rewrite — added Commit to Decisions + score bands (full endpoint contracts, versioning/breaking-change policy, idempotency rules, error envelope format, pagination pattern) |
| `solver-epic-solution-architect.md` | Full rewrite — added Commit to Decisions + score bands (API surface exposure, authorization model, error taxonomy, rate limiting position, audit logging scope, tech stack ambiguity resolution) |

#### Why this was needed:
Sprint planning runs were plateauing at scores 78-83 for epics/stories with open design decisions. Solvers were giving vague guidance instead of committing to concrete values. The new score bands force the solver to pick specific answers (exact thresholds, exact endpoint contracts, exact role names) which resolves what validators were flagging.

#### Deterministic score formula confirmed working:
`0 issues → 98; 1 minor → 97; 3 minors → 95; 1 major → 88; 2 majors → 83; 3 majors → 78; 4 majors → 73; 1 critical → 60`

---

### 2. Provider Switcher Button — FULLY IMPLEMENTED (commit `8c4cd82`)

A one-click provider preset switcher (Claude / Gemini / OpenAI) was implemented and integrated into ceremony modals.

#### All files are complete:

**New file:**
- `src/kanban/client/src/components/ceremony/ProviderSwitcherButton.jsx` — dropdown button component with `detectProvider()`, `applyProviderPreset()`, loading spinner, key status badges

**Modified files:**
- `src/cli/init.js` — `providerPresets` added to all 3 ceremonies (sponsor-call, sprint-planning, seed) in `defaultConfig`
- `src/kanban/server/routes/settings.js` — `PROVIDER_PRESETS` constant + migration inject in GET handler for existing projects without presets
- `src/kanban/client/src/components/ceremony/SprintPlanningModal.jsx` — settings state + `ProviderSwitcherButton` in header
- `src/kanban/client/src/components/ceremony/SponsorCallModal.jsx` — settings state + `ProviderSwitcherButton` in header (**done this session**)
- `src/kanban/client/src/components/ceremony/CeremonyWorkflowModal.jsx` — already had the button

**Provider-stage model assignments:**

| Provider | Heavy | Standard | Light |
|----------|-------|----------|-------|
| claude | `claude-opus-4-6` | `claude-sonnet-4-6` | `claude-haiku-4-5-20251001` |
| gemini | `gemini-2.5-pro` | `gemini-2.5-flash` | `gemini-2.5-flash-lite` |
| openai | `gpt-5.4` (all tiers same) | `gpt-5.4` | `gpt-5-mini` |

**Verification checklist (not yet run):**
1. Open Sprint Planning modal → header shows `⚡ Claude ▾` dropdown
2. Click Gemini → stages in `avc.json` updated to Gemini models
3. Settings → Ceremony Models tab → confirms all stages show Gemini
4. Click Claude → reverts to claude presets
5. Provider without API key → badge shows "no key" (greyed)
6. Open Sponsor Call modal → same switcher visible
7. Existing `.avc` projects → GET /api/settings injects presets automatically
8. New `/init` → `avc.json` includes `providerPresets`

---

## Current State

- **Branch:** `master`
- **Last commit:** `8c4cd82` — "feat: add ProviderSwitcherButton to SponsorCallModal"
- **Build:** Client built successfully (`✓ built in 55.20s`)
- **Tests:** Not run this session (no code logic changes, only UI integration)

---

## What's Still Pending / Could Be Done Next

1. **Manual verification** of the ProviderSwitcherButton in the browser (checklist above)
2. **Run a fresh sprint-planning ceremony** to validate the 6 updated solver files working together — prior run (`sprint-planning-2026-03-10-20-32-40.log`) stopped mid-way due to OpenAI 429 rate limits at story 17
3. **Administration epic stories** (5 stories) never completed in the last run — Create/Deactivate Accounts, Change User Roles, Manage Messaging Credentials, Export Customer Data, Delete Customer Data
4. **Epic API solver** still scored 83 on Foundation Services (versioning/idempotency issues) — new solver should fix this on next run
5. **Epic SA solver** still scored 83 on Customer Records and WhatsApp — new solver should fix these on next run

---

## Key Files Reference

```
src/cli/agents/
  solver-story-solution-architect.md   ← story SA solver (60-78 band added)
  solver-epic-security.md              ← full rewrite
  solver-epic-backend.md               ← full rewrite
  solver-epic-frontend.md              ← full rewrite
  solver-epic-api.md                   ← full rewrite
  solver-epic-solution-architect.md    ← full rewrite

src/kanban/client/src/components/ceremony/
  ProviderSwitcherButton.jsx           ← new component (complete)
  SponsorCallModal.jsx                 ← integrated (this session)
  SprintPlanningModal.jsx              ← integrated (prior session)
  CeremonyWorkflowModal.jsx            ← integrated (prior session)

src/kanban/server/routes/settings.js  ← PROVIDER_PRESETS migration
src/cli/init.js                        ← providerPresets in defaultConfig
```

---

## Project Context

- **Repo:** `/mnt/x/Git/nacho.coll/agilevibecoding`
- **Framework:** Agile Vibe Coding (AVC) — npm CLI `@agile-vibe-coding/avc`
- **Test project:** `/mnt/x/Git/nacho.coll/wallawhats` (WhatsApp CRM)
- **Sprint planning logs location:** `X:\Git\nacho.coll\wallawhats\.avc\logs\`
- **Current date:** 2026-03-12
- **Model:** Claude Sonnet 4.6 (`claude-sonnet-4-6`)
