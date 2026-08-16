// Node wrapper around tts-edge.py — Microsoft Edge's free neural TTS service
// (the same "more human" voices Edge Reader uses). No API key, no account;
// requires internet access and the `edge_tts` Python package (see tts-edge.py).
// Quality tier sits between Windows SAPI (robotic, but offline) and ElevenLabs
// (premium, needs a key) — see tts.mjs for how the dispatcher picks engines.
import { spawn, spawnSync } from "node:child_process";
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readAudioDurationMs, rescaleCues } from "./wav.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PY = join(__dirname, "tts-edge.py");

export const DEFAULT_EDGE_VOICE = "en-US-EmmaMultilingualNeural";

const PYTHON_COMMANDS = ["python", "py"];

let pythonCmdCache = null;

// Windows can ship a Microsoft-Store "python" alias that opens the Store
// instead of running anything; probe each candidate with a real version
// check and pick the first one that actually works.
function findPythonCommand() {
  if (pythonCmdCache) return pythonCmdCache;
  for (const cmd of PYTHON_COMMANDS) {
    try {
      const probe = spawnSync(cmd, ["-c", "import edge_tts"], { windowsHide: true, timeout: 15000, encoding: "utf8" });
      if (probe.status === 0) {
        pythonCmdCache = cmd;
        return cmd;
      }
    } catch (err) {
      // candidate not found — try the next one
    }
  }
  pythonCmdCache = null;
  return null;
}

export function isEdgeTtsAvailable() {
  return Boolean(findPythonCommand());
}

function runPython(args) {
  const cmd = findPythonCommand();
  if (!cmd) return Promise.reject(new Error("Python with edge-tts not available"));
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, ["-u", PY, ...args], { windowsHide: true });
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) reject(new Error(`tts-edge.py exited ${code}: ${stderr.trim().slice(-2000)}`));
      else resolve();
    });
  });
}

// The pipeline's rate knob is Windows SAPI's -10..10 scale (shared with the
// SAPI path); edge-tts takes a percentage string. 4%/unit is a reasonable
// mapping (0 -> "+0%", 10 -> "+40%").
export function sapiRateToPercent(rate) {
  const clamped = Math.max(-10, Math.min(10, Number(rate) || 0));
  const pct = Math.round(clamped * 4);
  return `${pct >= 0 ? "+" : ""}${pct}%`;
}

export function edgeWordsToCues(words) {
  return (Array.isArray(words) ? words : [])
    .map((w) => ({ text: String(w.text ?? "").trim(), startMs: Number(w.startMs) || 0, endMs: Number(w.endMs) || 0 }))
    .filter((c) => c.text.length > 0 && c.endMs > 0);
}

export async function synthesizeWithEdge({ text, outAudioPath, voice, rate = 0, pitch = "+0Hz", volume = "+0%" }) {
  const tmp = mkdtempSync(join(tmpdir(), "sf-video-edge-"));
  const textPath = join(tmp, "text.txt");
  const timingPath = join(tmp, "timing.json");
  writeFileSync(textPath, text, "utf8");

  try {
    await runPython([
      "--text-path", textPath,
      "--out", outAudioPath,
      "--timing", timingPath,
      "--voice", voice || DEFAULT_EDGE_VOICE,
      "--rate", sapiRateToPercent(rate),
      "--pitch", pitch,
      "--volume", volume,
    ]);
    // Python's JSON has no BOM, but be defensive about UTF-8 BOM anyway.
    let rawText = readFileSync(timingPath, "utf8");
    if (rawText.charCodeAt(0) === 0xfeff) rawText = rawText.slice(1);
    const words = JSON.parse(rawText);
    return { rawWords: Array.isArray(words) ? words : [] };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// Full voiceover + word-synced cues for the dispatcher in tts.mjs. Rescales
// the (already-cumulative) word timestamps to the MP3's measured duration so
// the last caption doesn't get cut off and the timeline matches real audio.
export async function edgeVoiceover({ text, outDir, jobId, voice, rate = 0, pitch = "+0Hz" }) {
  const audioPath = `${outDir}/${jobId}-vo.mp3`;
  const { rawWords } = await synthesizeWithEdge({ text, outAudioPath: audioPath, voice, rate, pitch });
  const rawCues = edgeWordsToCues(rawWords);
  const actualDurationMs = await readAudioDurationMs(audioPath);
  const cues = rescaleCues(rawCues, actualDurationMs);
  return { provider: "edge", audioPath, cues };
}
