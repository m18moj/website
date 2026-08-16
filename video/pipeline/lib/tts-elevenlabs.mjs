// Premium voiceover upgrade path — used automatically once ELEVENLABS_API_KEY
// is set (see pipeline/lib/tts.mjs), same "optional, graceful without it"
// pattern this codebase already uses for NOWPayments/SMTP. Uses the
// with-timestamps endpoint so captions come from real character-level
// alignment, not an estimate.
import { writeFileSync } from "node:fs";

const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // "Rachel" — a standard premade ElevenLabs voice
const API_BASE = "https://api.elevenlabs.io/v1";

export async function synthesizeWithElevenLabs({ text, outAudioPath, apiKey, voiceId, modelId }) {
  const voice = voiceId || process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;
  const model = modelId || process.env.ELEVENLABS_MODEL_ID || "eleven_turbo_v2_5";

  const res = await fetch(`${API_BASE}/text-to-speech/${voice}/with-timestamps`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      text,
      model_id: model,
      voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`ElevenLabs TTS failed (${res.status}): ${body.slice(0, 500)}`);
  }

  const json = await res.json();
  const audioBuffer = Buffer.from(json.audio_base64, "base64");
  writeFileSync(outAudioPath, audioBuffer);

  return { alignment: json.alignment };
}

// Groups ElevenLabs' character-level alignment into word-level cues by
// splitting on whitespace, matching the {text, startMs, endMs} shape
// pipeline/lib/wav.mjs's rescaleCues and src/components/Captions.tsx expect.
export function alignmentToCues(alignment) {
  const { characters, character_start_times_seconds, character_end_times_seconds } = alignment;
  const cues = [];
  let word = "";
  let wordStart = null;
  for (let i = 0; i < characters.length; i++) {
    const ch = characters[i];
    if (/\s/.test(ch)) {
      if (word) {
        cues.push({
          text: word,
          startMs: Math.round(wordStart * 1000),
          endMs: Math.round(character_end_times_seconds[i - 1] * 1000),
        });
        word = "";
        wordStart = null;
      }
      continue;
    }
    if (wordStart === null) wordStart = character_start_times_seconds[i];
    word += ch;
  }
  if (word) {
    cues.push({
      text: word,
      startMs: Math.round(wordStart * 1000),
      endMs: Math.round(character_end_times_seconds[character_end_times_seconds.length - 1] * 1000),
    });
  }
  return cues;
}
