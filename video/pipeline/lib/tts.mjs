// Voiceover dispatcher. Picks ElevenLabs when ELEVENLABS_API_KEY is set
// (premium quality, real character-level alignment), otherwise falls back
// to Windows' built-in SAPI voices (free, offline, zero setup — see
// tts-sapi.mjs) so the pipeline always produces a real voiceover, never a
// placeholder beep. Same "optional upgrade, graceful default" shape this
// codebase already uses for NOWPayments/SMTP (see root README).
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { platform } from "node:os";
import { synthesizeWithElevenLabs, alignmentToCues } from "./tts-elevenlabs.mjs";
import { synthesizeWithSapi, eventsToCues } from "./tts-sapi.mjs";
import { readWavDurationMs, rescaleCues } from "./wav.mjs";

export async function synthesizeVoiceover({ text, outDir, jobId, voiceHint, rate = 0 }) {
  mkdirSync(outDir, { recursive: true });
  const apiKey = process.env.ELEVENLABS_API_KEY;

  if (apiKey) {
    const audioPath = `${outDir}/${jobId}-vo.mp3`;
    const { alignment } = await synthesizeWithElevenLabs({ text, outAudioPath: audioPath, apiKey });
    const cues = alignmentToCues(alignment);
    return { provider: "elevenlabs", audioPath, cues };
  }

  if (platform() !== "win32") {
    throw new Error(
      "No ELEVENLABS_API_KEY set and this isn't Windows, so there's no voiceover engine available. " +
        "Set ELEVENLABS_API_KEY in video/.env to enable real voiceover on any OS."
    );
  }

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
