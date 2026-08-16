// Loads env vars for the video pipeline. Checked in this order (first value
// found for a given key wins) so the pipeline needs zero required setup of
// its own: video/.env for video-only overrides (e.g. a dedicated
// ELEVENLABS_API_KEY), then the store's root .env, then discord-bot/.env —
// which already holds the shared ANTHROPIC_API_KEY used by the site's
// assistant, so the video pipeline's Claude-based copywriting reuses that
// same key instead of asking for a duplicate. This only ever *reads* those
// files; nothing here writes to them.
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..", ".."); // video/pipeline/lib -> project root

config({ path: join(ROOT, "video", ".env"), quiet: true });
config({ path: join(ROOT, ".env"), quiet: true });
config({ path: join(ROOT, "discord-bot", ".env"), quiet: true });

export const env = process.env;

export function requireEnv(name, hint) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} in the environment.${hint ? ` ${hint}` : ""}`);
  }
  return value;
}
