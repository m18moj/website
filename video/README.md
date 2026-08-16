# ScripForge Video Pipeline

Fully automated video generation for the ScripForge storefront: TikTok cuts,
YouTube Shorts, per-pack promo videos, and a premium 16:9 website promo.
Isolated from the main store app — its own `package.json`/`node_modules`,
read-only access to the store's catalog data, no shared runtime with
`server/`, `discord-bot/`, or `social/`.

```
inputs (catalog DB + real script source)
  -> ad copy (Claude, grounded in real data)
  -> voiceover (Microsoft Edge neural TTS, free + human-sounding — falls back to Windows SAPI, or ElevenLabs if configured)
  -> music + SFX (procedurally synthesized, mood-matched per pack)
  -> mix (sidechain ducking, loudness normalization)
  -> edit/animation (Remotion composition, captions synced to real VO timing)
  -> render (h264 via @remotion/cli)
  -> QA (ffprobe/ffmpeg: streams, resolution, fps, duration, loudness, clipping, silence, black frames)
```

## Setup

```
npm run video:setup          # from repo root — installs video/node_modules
npm run video:tts-setup      # installs the edge-tts Python package (free, human-sounding voiceover)
```

Requires `ffmpeg`/`ffprobe` on PATH (used for audio mixing and QA).

Voiceover needs zero configuration: the dispatcher (`pipeline/lib/tts.mjs`)
uses Microsoft Edge's neural TTS by default (needs internet + `pip install
edge-tts`, run via `npm run video:tts-setup`), falls back to Windows' built-in
SAPI voices when Edge isn't available, and upgrades to ElevenLabs whenever
`ELEVENLABS_API_KEY` is set in `video/.env` — see `video/.env.example`.

Ad-copy generation reuses the `ANTHROPIC_API_KEY` already configured in
`discord-bot/.env` — nothing else to set up there.

## Generating videos

```
cd video

# One pack, one platform
node pipeline/orchestrate.mjs --pack minecraft --platform tiktok
node pipeline/orchestrate.mjs --pack minecraft --platform shorts
node pipeline/orchestrate.mjs --pack minecraft --platform promo

# The flagship website promo (16:9)
node pipeline/orchestrate.mjs --website

# Every pack x every social platform
node pipeline/orchestrate.mjs --all

# Every pack x every social platform, plus the website promo
node pipeline/orchestrate.mjs --all --website
```

Or from the repo root: `npm run video:generate -- --pack minecraft --platform tiktok`.

Output lands in `video/output/<platform>/<packId>.mp4` (and
`video/output/website-premium.mp4`). Build artifacts (voiceover, music, mix,
`props.json`, QA report) land in `video/build/<jobId>/` for inspection —
neither directory is committed to git.

## Preview in Remotion Studio

```
npm run studio
```

Opens the interactive Remotion Studio with the `SocialVertical` and
`WebsitePremium` compositions, using the sample props in `src/sampleProps.ts`.

## Convenience scripts

- `node pipeline/scripts/list-packs.mjs` — list every pack with its real script count/price
- `node pipeline/scripts/gen-copy.mjs --pack minecraft --platform tiktok` — preview AI ad copy only
- `node pipeline/scripts/gen-audio.mjs --pack minecraft --platform tiktok` — build VO+music+mix only, no render
- `node pipeline/scripts/gen-sfx.mjs` — (re)generate the shared procedural SFX kit
- `node pipeline/scripts/render-one.mjs --job minecraft-tiktok --composition SocialVertical --out output/tiktok/minecraft.mp4` — re-render from an existing `build/<jobId>/props.json`
- `node pipeline/scripts/qa-one.mjs --file output/tiktok/minecraft.mp4 --width 1080 --height 1920` — QA an existing file standalone

## Architecture

- `src/` — Remotion compositions/scenes/components (`SocialVertical` for
  TikTok/Shorts/promo, `WebsitePremium` for the 16:9 commercial). Brand
  theme and per-pack visual themes are in `src/theme.ts` /
  `src/packThemes.ts`, ported 1:1 from the live site's CSS.
- `pipeline/lib/` — the automation: `db.mjs` (read-only catalog access),
  `copywriter.mjs` (Claude-generated ad copy, grounded in real pack/script
  data), `tts.mjs`/`tts-edge.mjs`/`tts-sapi.mjs`/`tts-elevenlabs.mjs`
  (voiceover with real word timestamps: Edge neural free default, SAPI
  offline fallback, ElevenLabs premium), `music.mjs`/`sfx.mjs` (procedural
  audio synthesis, no external audio APIs), `mix.mjs` (ffmpeg
  ducking/normalization), `qa.mjs` (automated output validation), `render.mjs`
  (Remotion render driver).
- `pipeline/config/` — `moods.mjs` (12 pack moods + website, driving music
  generation) and `platforms.mjs` (per-platform dimensions/fps/timing/TTS rate).
- `pipeline/orchestrate.mjs` — the end-to-end CLI entry point.

## Notes on quality control

Automated QA (`pipeline/lib/qa.mjs`) checks stream-level health — resolution,
fps, duration, loudness, clipping, silence, black frames — but does **not**
check whether captions are readable or visuals overlap. A video can pass
every automated check and still look wrong. Always spot-check a rendered
video (or a contact-sheet of sampled frames) before trusting a batch run,
especially after changing anything in `src/components/` or `src/scenes/`.
