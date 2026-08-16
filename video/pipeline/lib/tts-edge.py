#!/usr/bin/env python3
# Synthesizes speech with Microsoft Edge's neural TTS service (the same free
# voices Edge Reader / edge-tts use — "more human" than the legacy Windows
# SAPI engine), writes the audio to a 24kHz mono MP3, and dumps exact
# word-level timestamps to a JSON file for caption sync.
#
# Requires the `edge_tts` Python package (free, no API key): `pip install
# edge-tts`. Node side calls this via pipeline/lib/tts-edge.mjs, which also
# handles falling back to Windows SAPI when Edge/the network isn't available.
#
# Why this exists instead of calling `edge-tts` CLI's --write-subtitles: the
# CLI writes *sentence*-level SRT cues; captions in this pipeline are word-
# synced, so we use the library's stream() API directly with
# boundary="WordBoundary" to get per-word offsets (which are cumulative
# across the whole utterance, even when long text gets split across
# requests). Offsets/durations arrive as 100ns ticks; we convert to ms here.
import argparse
import asyncio
import json
import sys


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--text-path", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--timing", required=True)
    parser.add_argument("--voice", default="en-US-EmmaMultilingualNeural")
    parser.add_argument("--rate", default="+0%")
    parser.add_argument("--pitch", default="+0Hz")
    parser.add_argument("--volume", default="+0%")
    return parser.parse_args()


async def synthesize(args):
    try:
        import edge_tts
    except ImportError as err:
        sys.stderr.write(
            "edge-tts Python package is not installed. Run: pip install edge-tts\n"
        )
        raise

    with open(args.text_path, encoding="utf-8") as handle:
        text = handle.read()

    communicate = edge_tts.Communicate(
        text,
        args.voice,
        rate=args.rate,
        pitch=args.pitch,
        volume=args.volume,
        boundary="WordBoundary",
    )

    words = []
    audio_bytes = 0
    with open(args.out, "wb") as media:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                media.write(chunk["data"])
                audio_bytes += len(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                offset = chunk.get("offset") or 0
                duration = chunk.get("duration") or 0
                words.append(
                    {
                        "text": (chunk.get("text") or "").strip(),
                        "startMs": round(offset / 10000.0),
                        "endMs": round((offset + duration) / 10000.0),
                    }
                )

    if audio_bytes == 0:
        raise RuntimeError("Edge TTS returned no audio (is the network reachable?)")
    if not words:
        raise RuntimeError("Edge TTS returned no word boundaries")

    with open(args.timing, "w", encoding="utf-8") as handle:
        json.dump(words, handle, ensure_ascii=False)


def main():
    args = parse_args()
    try:
        asyncio.run(synthesize(args))
    except Exception as err:  # surface a clean, one-line failure to Node
        sys.stderr.write(f"edge-tts failed: {err}\n")
        sys.exit(1)


if __name__ == "__main__":
    main()
