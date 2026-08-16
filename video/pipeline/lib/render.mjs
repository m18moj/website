import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const VIDEO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export async function renderComposition({ compositionId, props, outPath, propsFileName, crf = 17 }) {
  mkdirSync(dirname(outPath), { recursive: true });
  const propsDir = join(VIDEO_ROOT, "build", "props");
  mkdirSync(propsDir, { recursive: true });
  const propsPath = join(propsDir, propsFileName || `${compositionId}-${Date.now()}.json`);
  writeFileSync(propsPath, JSON.stringify(props));

  await new Promise((resolve, reject) => {
    const proc = spawn(
      "npx",
      [
        "remotion",
        "render",
        "src/index.ts",
        compositionId,
        outPath,
        "--props",
        propsPath,
        "--codec",
        "h264",
        "--crf",
        String(crf),
        "--overwrite",
      ],
      { cwd: VIDEO_ROOT, windowsHide: true, shell: true }
    );
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.stdout.on("data", () => {});
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) reject(new Error(`remotion render exited ${code}\n${stderr.slice(-4000)}`));
      else resolve();
    });
  });

  return outPath;
}
