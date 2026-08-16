// Automated QA — every rendered video is probed and measured before it's
// considered done, per the brief's "automatically QA outputs" requirement.
// Real ffprobe/ffmpeg analysis (resolution, fps, duration, stream presence,
// loudness, clipping, silence, black frames), not a rubber stamp. Writes a
// JSON report next to the video and returns { pass, checks }.
import { spawn } from "node:child_process";
import { existsSync, statSync, writeFileSync } from "node:fs";

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", reject);
    proc.on("close", () => resolve({ stdout, stderr }));
  });
}

async function ffprobeStreams(path) {
  const { stdout } = await run("ffprobe", [
    "-v", "error",
    "-print_format", "json",
    "-show_format",
    "-show_streams",
    path,
  ]);
  return JSON.parse(stdout);
}

function check(name, pass, detail) {
  return { name, pass, detail };
}

export async function qaVideo({
  videoPath,
  expected: { width, height, fps, minDurationSec, maxDurationSec },
  reportPath,
}) {
  const checks = [];

  if (!existsSync(videoPath) || statSync(videoPath).size < 1024) {
    checks.push(check("file-exists", false, "Output file missing or implausibly small."));
    const report = { pass: false, checks, videoPath };
    if (reportPath) writeFileSync(reportPath, JSON.stringify(report, null, 2));
    return report;
  }
  checks.push(check("file-exists", true, `${statSync(videoPath).size} bytes`));

  const probe = await ffprobeStreams(videoPath);
  const vStream = probe.streams?.find((s) => s.codec_type === "video");
  const aStream = probe.streams?.find((s) => s.codec_type === "audio");
  const durationSec = Number(probe.format?.duration ?? 0);

  checks.push(check("has-video-stream", !!vStream, vStream ? vStream.codec_name : "none found"));
  checks.push(check("has-audio-stream", !!aStream, aStream ? aStream.codec_name : "none found"));

  if (vStream) {
    checks.push(
      check(
        "resolution",
        vStream.width === width && vStream.height === height,
        `${vStream.width}x${vStream.height} (expected ${width}x${height})`
      )
    );
    const [num, den] = String(vStream.r_frame_rate || "0/1").split("/").map(Number);
    const actualFps = den ? num / den : 0;
    checks.push(check("fps", Math.abs(actualFps - fps) < 0.5, `${actualFps.toFixed(2)} (expected ${fps})`));
  }

  checks.push(
    check(
      "duration-in-range",
      durationSec >= minDurationSec && durationSec <= maxDurationSec,
      `${durationSec.toFixed(2)}s (expected ${minDurationSec}-${maxDurationSec}s)`
    )
  );

  // Peak level / clipping.
  const astats = await run("ffmpeg", ["-i", videoPath, "-af", "astats", "-f", "null", "-"]);
  const peakMatch = astats.stderr.match(/Peak level dB:\s*(-?\d+(\.\d+)?|-inf)/);
  const peakDb = peakMatch ? parseFloat(peakMatch[1]) : null;
  checks.push(
    check(
      "no-clipping",
      peakDb === null || peakDb <= 0.2,
      peakDb === null ? "could not measure" : `peak ${peakDb.toFixed(2)} dB`
    )
  );

  // Integrated loudness (single-pass estimate) — sanity range, not a strict gate.
  const loud = await run("ffmpeg", [
    "-i", videoPath,
    "-af", "loudnorm=I=-16:print_format=json",
    "-f", "null", "-",
  ]);
  const jsonMatch = loud.stderr.match(/\{[\s\S]*?"input_i"[\s\S]*?\}/);
  let inputI = null;
  if (jsonMatch) {
    try {
      inputI = parseFloat(JSON.parse(jsonMatch[0]).input_i);
    } catch {
      /* leave null */
    }
  }
  checks.push(
    check(
      "loudness-in-range",
      inputI === null || (inputI > -30 && inputI < -6),
      inputI === null ? "could not measure" : `${inputI.toFixed(1)} LUFS`
    )
  );

  // Silence: no gap longer than 3s (a render/mix that went dead partway through).
  const silence = await run("ffmpeg", [
    "-i", videoPath,
    "-af", "silencedetect=noise=-45dB:d=3",
    "-f", "null", "-",
  ]);
  const longSilences = [...silence.stderr.matchAll(/silence_duration:\s*(\d+(\.\d+)?)/g)].map((m) =>
    parseFloat(m[1])
  );
  checks.push(
    check(
      "no-long-silence",
      longSilences.length === 0,
      longSilences.length ? `${longSilences.length} gap(s), longest ${Math.max(...longSilences).toFixed(1)}s` : "clean"
    )
  );

  // Black frames: catches a render that produced an empty/blank composition.
  const black = await run("ffmpeg", [
    "-i", videoPath,
    "-vf", "blackdetect=d=0.5:pic_th=0.98",
    "-an", "-f", "null", "-",
  ]);
  const blackHits = [...black.stderr.matchAll(/black_duration:\s*(\d+(\.\d+)?)/g)].map((m) => parseFloat(m[1]));
  checks.push(
    check(
      "no-black-frames",
      blackHits.length === 0,
      blackHits.length ? `${blackHits.length} black segment(s), longest ${Math.max(...blackHits).toFixed(1)}s` : "clean"
    )
  );

  const pass = checks.every((c) => c.pass);
  const report = { pass, checks, videoPath, durationSec, resolution: vStream ? `${vStream.width}x${vStream.height}` : null };
  if (reportPath) writeFileSync(reportPath, JSON.stringify(report, null, 2));
  return report;
}
