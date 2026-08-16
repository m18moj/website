# AI/Social automation

A standalone process (`npm run social`) that autonomously turns ScripForge's catalog into TikTok + YouTube Shorts posts: strategy → script → creative brief → video job (handed to a separate video-rendering pipeline) → QA → schedule → publish → analytics → learning, feeding back into the next campaign's strategy. Shares the site's SQLite database over WAL, same as `discord-bot/` — no separate setup. See the root `README.md`'s "AI/Social automation" section for install/setup steps, and `VIDEO_JOB_CONTRACT.md` for the exact interface with the video pipeline.

## Why a separate process

Same reasoning as `discord-bot/` being separate from the web server: this runs on its own cadence, calls slow external APIs (Anthropic, YouTube, TikTok), and a crash or hang here should never affect checkout/browsing. `social/db.js` just re-exports `server/db.js` — SQLite's WAL mode is what makes three independent processes safely sharing one file work at all.

## The eight agents (`agents/`)

| Agent | Role |
|---|---|
| `strategyAgent` | Picks the angle, goal, audience, and hook for one campaign — reads back `social_insights` (what's worked) and `social_trends` (what's hot) so it doesn't repeat itself. |
| `scriptAgent` | Turns strategy into a beat-by-beat 15-60s script (hook, voiceover, on-screen text, CTA). |
| `creativeDirectionAgent` | Turns the script into a visual brief (style, pacing, music, asset suggestions) for the video pipeline. |
| `productPromotionAgent` | Grounds the campaign in real store data — actual script titles/prices, a real live promo code if one exists — so nothing invents pricing or a discount. |
| `trendsAgent` | Real YouTube Data API trending pull (gaming category) plus an LLM synthesis step for TikTok-relevant angles, since TikTok's own trend APIs require an approval this business doesn't have. |
| `qaAgent` | Gate before scheduling: checks the video pipeline actually produced usable output, and screens copy for platform-policy risk (see "Content framing" below). |
| `publishingAgent` | Writes the final title/description/hashtags; picks the post time deterministically (from a learned best-hour insight if one exists, otherwise a sane default rotation) rather than asking the LLM to do date arithmetic. |
| `analyticsLearningAgent` | `collect()` pulls real stats for published posts; `learn()` periodically synthesizes those stats (joined with the strategy/creative choices behind them) into `social_insights` — the actual optimization loop. |

Every agent calls `agents/llm.js`'s `structured()`, which forces a single tool-call response against a JSON Schema (Anthropic's Messages API `tool_choice`) so callers get a validated object back, never prose to parse.

## Content framing (read before enabling)

ScripForge sells developer/customization *scripts*, not "cheats" or "hacks" — every agent's system prompt is written around that framing, and `qaAgent` explicitly rejects copy that reads as promoting cheating or ToS violations before anything is scheduled. This matters beyond brand tone: TikTok/YouTube both actively enforce policy against content promoting cheating in games, and getting flagged risks the account, not just one video.

## Persistence & the job queue (`jobQueue.js`, `jobRunner.js`, `scheduler.js`)

Everything — both the recurring triggers and every pipeline stage — is a row in `social_jobs`, not an in-memory timer:

- **`scheduler.js`** (node-cron) enqueues recurring triggers (`detect_new_products`, `evergreen_tick`, `refresh_trends`, `poll_video_jobs`, `publish_due_posts`, `collect_analytics`, `run_learning`, `cleanup_jobs`) with a fixed `dedup_key` per trigger name.
- **`jobQueue.js`** enforces the duplicate-protection guarantee: a partial unique index on `(dedup_key)` where `status IN ('pending','running')` means enqueuing the same key while a prior job with it hasn't finished is a safe no-op — a slow tick or a restart can never double-schedule the same work. Failures get exponential backoff (30s → 1h cap) up to `max_attempts` before landing in `failed`.
- **`jobRunner.js`** polls (`SOCIAL_POLL_INTERVAL_MS`, default 10s), claims a small batch, and dispatches by `job_type` to the handler map in `orchestrator.js`.
- **`orchestrator.js`** is the actual state machine — one function per pipeline stage or trigger, each persisting its result on the `social_campaigns` row and enqueuing the next stage with `dedup_key = "<stage>:campaign:<id>"`.

Since a restart just leaves rows sitting in `social_jobs`/`social_campaigns` at whatever stage they were in, nothing needs a recovery path beyond "start the process again."

## Campaign lifecycle

```
strategy → scripting → creative → video_queued → video_rendering → qa
                                                                     ├─ pass → scheduled → publishing → published
                                                                     └─ fail → creative (retry, max 2) → qa_failed (manual review via API)
```

`video_rendering` is the one stage this system doesn't drive directly — `poll_video_jobs` (every 2 min) just watches `video_jobs.status` for `completed`/`failed`, written by the separate video pipeline (see `VIDEO_JOB_CONTRACT.md`).

## Safety defaults

`SOCIAL_ENABLED=false` and `SOCIAL_DRY_RUN=true` by default (`social/.env.example`) — the full pipeline runs, including real Anthropic API calls, but `publish_due_posts` never calls a platform API until both are explicitly changed. A platform with no credentials configured (`platforms/youtube.js`/`platforms/tiktok.js` both expose `isConfigured()`) simply means that platform's campaigns queue at `scheduled` forever rather than erroring — see `GET /api/social/status` (admin-only, `server/routes/social.js`) for what's currently configured.

## Manual control

No UI is added (out of scope) — `server/routes/social.js`, mounted at `/api/social` and gated by the same `requireAdmin` as the rest of the site:

- `GET /api/social/status` — queue depth, per-status campaign counts, which platforms are configured.
- `GET /api/social/campaigns` / `GET /api/social/campaigns/:id` — inspect the pipeline.
- `POST /api/social/campaigns/:packId/promote` — manually start a campaign for one pack (optionally one platform via `{"platform": "tiktok"}` in the body), bypassing the normal detection/evergreen cadence.
- `POST /api/social/campaigns/:id/retry` — re-enters a `failed`/`qa_failed`/`cancelled` campaign at the strategy stage.
