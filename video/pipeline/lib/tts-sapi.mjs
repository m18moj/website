// Node wrapper around tts-sapi.ps1 — Windows' built-in System.Speech voices.
// Zero API key, zero setup, fully offline; the quality upgrade path is
// ElevenLabs (see tts-elevenlabs.mjs / tts.mjs) once ELEVENLABS_API_KEY is set.
import { spawn } from "node:child_process";
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PS1 = join(__dirname, "tts-sapi.ps1");

function runPowerShell(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", PS1, ...args],
      { windowsHide: true }
    );
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) reject(new Error(`tts-sapi.ps1 exited ${code}: ${stderr}`));
      else resolve();
    });
  });
}

// Converts SpeakProgress word events (start time only) into [{text, startMs,
// endMs}] cues — end time is the next word's start (or the clip's total
// duration for the last word).
function eventsToCues(events, totalMs) {
  const words = (Array.isArray(events) ? events : [events]).filter(Boolean);
  return words.map((w, i) => ({
    text: String(w.text ?? "").trim(),
    startMs: w.audioMs ?? 0,
    endMs: i + 1 < words.length ? words[i + 1].audioMs : totalMs,
  })).filter((c) => c.text.length > 0);
}

export async function synthesizeWithSapi({ text, outWavPath, voiceName, rate = 0 }) {
  const tmp = mkdtempSync(join(tmpdir(), "sf-video-tts-"));
  const textPath = join(tmp, "text.txt");
  const timingPath = join(tmp, "timing.json");
  writeFileSync(textPath, text, "utf8");

  try {
    await runPowerShell([
      "-TextPath", textPath,
      "-WavPath", outWavPath,
      "-TimingPath", timingPath,
      "-VoiceName", voiceName || "",
      "-Rate", String(rate),
    ]);
    // PowerShell's -Encoding UTF8 writes a BOM, which JSON.parse rejects.
    let rawText = readFileSync(timingPath, "utf8");
    if (rawText.charCodeAt(0) === 0xfeff) rawText = rawText.slice(1);
    const raw = JSON.parse(rawText);
    return { rawEvents: Array.isArray(raw) ? raw : raw ? [raw] : [] };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

export { eventsToCues };
