# Video job contract (AI/Social ↔ Video generation)

This repo has two systems being built in parallel: this one (`social/`, AI/Social automation) and a separate video-generation pipeline. Neither touches the other's code. The `video_jobs` table (in `server/db.js`, shared SQLite file) is the entire interface between them — this document defines that interface from the AI/Social side. **If the video pipeline's actual contract differs from this, this file should be updated to match reality rather than the other way around** — this was written without visibility into that system's design, as a reasonable starting point to hand off.

## What AI/Social writes

When a campaign reaches the `video_queued` stage (`social/orchestrator.js` → `enqueueVideoJob`), it inserts one row:

```sql
INSERT INTO video_jobs (campaign_id, input_json, priority) VALUES (?, ?, 0)
-- status defaults to 'pending'
```

`input_json` is a JSON-encoded object shaped like this:

```jsonc
{
  "campaignId": 42,
  "platform": "tiktok",              // "tiktok" | "youtube_shorts"
  "aspectRatio": "9:16",
  "targetDurationSeconds": 28,        // from the script agent, 15-60 typical

  "pack": {                           // null for a general brand-awareness campaign
    "packId": "roblox-scripts",
    "packName": "Roblox Starter Pack",
    "gameTitle": "Roblox"
  },

  "script": {
    "hookLine": "...",
    "beats": [
      { "startSeconds": 0, "visual": "...", "voiceover": "...", "onScreenText": "..." }
      // 3-8 beats
    ],
    "ctaLine": "...",
    "targetDurationSeconds": 28
  },

  "creative": {
    "visualStyle": "...",
    "moodKeywords": ["...", "..."],
    "musicVibe": "...",
    "pacing": "fast_cut",             // "fast_cut" | "medium" | "steady"
    "onScreenTextStyle": "...",
    "thumbnailConcept": "...",
    "assetSuggestions": ["...", "..."]
  },

  "promotion": {
    "featuredScriptTitles": ["...", "..."],
    "priceCallout": "...",
    "urgencyAngle": "...",
    "promoLine": "...",               // "" if no promo code is live
    "promoCode": "SAVE15",            // null if none
    "ctaUrl": "https://scripforge.net/pages/catalog?pack=roblox-scripts"
  },

  "brand": {
    "background": "#0f0f1e",
    "accentCyan": "#00d9ff",
    "accentPurple": "#a855f7",
    "text": "#ffffff"
  }
}
```

## What the video pipeline is expected to write back

```sql
UPDATE video_jobs
SET status = 'completed',           -- or 'failed'
    output_path = ?,                -- absolute path to the rendered file on this machine
    output_meta_json = ?,           -- see below
    error = ?,                      -- only when status = 'failed'
    updated_at = datetime('now')
WHERE id = ?
```

`output_meta_json` (only required on success; `durationSeconds` is the one field QA actually checks — see `social/agents/qaAgent.js`):

```jsonc
{
  "durationSeconds": 27.4,
  "width": 1080,
  "height": 1920,
  "fileSizeBytes": 8123456
}
```

Optional, not currently read by this side but harmless to include: `claimed_by` (a worker/process identifier) and `claimed_at` while rendering is in progress, and intermediate `status = 'claimed'` / `'rendering'` values — AI/Social's `poll_video_jobs` trigger (runs every 2 minutes, see `social/scheduler.js`) only acts on `completed` or `failed`; anything else is treated as "still working."

## What happens on each side

- AI/Social **never** reads or writes any file under the video pipeline's own directories, and never touches `output_path`'s contents beyond checking it exists on disk (QA) and reading its bytes to upload (publishing). It only writes to `video_jobs` rows it created itself.
- The video pipeline should treat `input_json` as read-only input and never needs to touch `social_campaigns` or any other `social_*`/social/ table — `campaign_id` is provided only so it can log/debug which campaign a job belongs to.
- If the video pipeline can't render a job (bad input, resource exhaustion, whatever), write `status='failed'` + a human-readable `error` rather than leaving it stuck at `pending`/`rendering` forever — AI/Social's poll trigger only reacts to a terminal status, and never times out an in-flight job on its own.
