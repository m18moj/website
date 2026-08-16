// Generates (or verifies) the shared procedural SFX kit used by every video
// — idempotent, safe to run any time. Real render/orchestrate runs already
// call this automatically; this script exists for standalone regeneration.
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureSfxKit } from "../lib/sfx.mjs";

const VIDEO_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const SFX_DIR = join(VIDEO_ROOT, "public", "sfx");

const files = ensureSfxKit(SFX_DIR);
console.log(`SFX kit ready at ${SFX_DIR}`);
for (const f of files) console.log(" -", f);
