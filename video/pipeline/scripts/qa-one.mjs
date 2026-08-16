// Runs the automated QA suite (pipeline/lib/qa.mjs) against an already
// rendered video file, without re-running the rest of the pipeline.
//   node pipeline/scripts/qa-one.mjs --file output/tiktok/minecraft.mp4 --width 1080 --height 1920 --fps 30 --min 8 --max 60
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { qaVideo } from "../lib/qa.mjs";

const VIDEO_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");

const args = process.argv.slice(2);
const get = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : fallback;
};

async function main() {
  const file = get("--file");
  if (!file) {
    console.error(
      "Usage: node pipeline/scripts/qa-one.mjs --file <path> [--width 1080] [--height 1920] [--fps 30] [--min <sec>] [--max <sec>]"
    );
    process.exit(1);
  }
  const videoPath = join(VIDEO_ROOT, file);
  const report = await qaVideo({
    videoPath,
    expected: {
      width: Number(get("--width", 1080)),
      height: Number(get("--height", 1920)),
      fps: Number(get("--fps", 30)),
      minDurationSec: Number(get("--min", 3)),
      maxDurationSec: Number(get("--max", 120)),
    },
    reportPath: join(VIDEO_ROOT, "build", "qa-one-report.json"),
  });
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) process.exitCode = 1;
}

main().catch((err) => {
  console.error("[qa-one] FAILED:", err.message);
  process.exitCode = 1;
});
