// Re-renders video from an already-built props.json (as written by
// orchestrate.mjs to build/<jobId>/props.json) — skips copy/voice/music
// regeneration entirely. Useful after a pure Remotion component/visual
// change when the audio and copy are already correct.
//   node pipeline/scripts/render-one.mjs --job minecraft-tiktok --composition SocialVertical --out output/tiktok/minecraft.mp4
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderComposition } from "../lib/render.mjs";

const VIDEO_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");

const args = process.argv.slice(2);
const get = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

async function main() {
  const jobId = get("--job");
  const compositionId = get("--composition");
  const outPath = get("--out");
  if (!jobId || !compositionId || !outPath) {
    console.error(
      "Usage: node pipeline/scripts/render-one.mjs --job <jobId> --composition <SocialVertical|WebsitePremium> --out <path>"
    );
    process.exit(1);
  }
  const propsPath = join(VIDEO_ROOT, "build", jobId, "props.json");
  const props = JSON.parse(readFileSync(propsPath, "utf8"));
  console.log(`rendering ${compositionId} from ${propsPath} -> ${outPath}`);
  await renderComposition({ compositionId, props, outPath: join(VIDEO_ROOT, outPath), propsFileName: `${jobId}-rerender.json` });
  console.log("done");
}

main().catch((err) => {
  console.error("[render-one] FAILED:", err.message);
  process.exitCode = 1;
});
