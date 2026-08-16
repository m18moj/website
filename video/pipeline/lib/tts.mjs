// Voiceover dispatcher. Picks, in order:
//   1. ElevenLabs when ELEVENLABS_API_KEY is set (premium quality, real
//      character-level alignment).
//   2. Microsoft Edge's neural voices via the free edge-tts service when the
//      `edge_tts` Python package is available (no API key; human-sounding
//      voices; needs internet). This is the default "sounds like a human"
//      free path.
//   3. Windows' built-in SAPI voices (free, offline, zero setup — see
//      tts-sapi.mjs) as the offline fallback.
// Set VIDEO_TTS_ENGINE=sapi to force SAPI (e.g. a fully offline box), or
// elevenlabs to require the premium engine. Same "optional upgrade, graceful
// default" shape this codebase already uses for NOWPayments/SMTP (see root
// README).
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { platform } from "node:os";
import { synthesizeWithElevenLabs, alignmentToCues } from "./tts-elevenlabs.mjs";
import { edgeVoiceover, DEFAULT_EDGE_VOICE, isEdgeTtsAvailable } from "./tts-edge.mjs";
import { synthesizeWithSapi, eventsToCues } from "./tts-sapi.mjs";
import { readWavDurationMs, rescaleCues } from "./wav.mjs";

const ENGINES = ["auto", "edge", "sapi", "elevenlabs"];

function pickEngine() {
  const requested = String(process.env.VIDEO_TTS_ENGINE || "auto").toLowerCase();
  if (!ENGINES.includes(requested)) return "auto";
  return requested;
}

async function sapiVoiceover({ text, outDir, jobId, voiceHint, rate }) {
  const audioPath = `${outDir}/${jobId}-vo.wav`;
  const { rawEvents } = await synthesizeWithSapi({
    text,
    outWavPath: audioPath,
    voiceName: voiceHint || process.env.VIDEO_TTS_VOICE || "",
    rate,
  });
  const rawCues = eventsToCues(rawEvents, 0);
  const actualDurationMs = readWavDurationMs(audioPath);
  const cues = rescaleCues(rawCues, actualDurationMs);
  return { provider: "sapi", audioPath, cues };
}

export async function synthesizeVoiceover({ text, outDir, jobId, voiceHint, rate = 0, pitch = "+0Hz" }) {
  mkdirSync(outDir, { recursive: true });
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const engine = pickEngine();

  if ((engine === "elevenlabs" || engine === "auto") && apiKey) {
    const audioPath = `${outDir}/${jobId}-vo.mp3`;
    const { alignment } = await synthesizeWithElevenLabs({ text, outAudioPath: audioPath, apiKey });
    const cues = alignmentToCues(alignment);
    return { provider: "elevenlabs", audioPath, cues };
  }

  const edgeAllowed = engine === "edge" || engine === "auto";
  if (edgeAllowed && isEdgeTtsAvailable()) {
    try {
      const voice = process.env.EDGE_TTS_VOICE || DEFAULT_EDGE_VOICE;
      return await edgeVoiceover({ text, outDir, jobId, voice, rate, pitch });
    } catch (err) {
      // Edge needs the network; don't let a transient outage kill the job —
      // fall back to offline SAPI (Windows) or surface the real error.
      console.warn(`[tts] Edge TTS failed (${err.message}); ${platform() === "win32" ? "falling back to SAPI." : "no fallback available."}`);
      if (platform() === "win32" && engine === "auto") return sapiVoiceover({ text, outDir, jobId, voiceHint, rate });
      throw err;
    }
  }

  if (platform() === "win32") {
    return sapiVoiceover({ text, outDir, jobId, voiceHint, rate });
  }

  throw new Error(
    "No voiceover engine available: ELEVENLABS_API_KEY not set, edge-tts Python package not installed, and this isn't Windows (no SAPI). " +
      "Install edge-tts (`pip install edge-tts`) or set ELEVENLABS_API_KEY in video/.env."
  );
}
