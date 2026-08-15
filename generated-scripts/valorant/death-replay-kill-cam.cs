/*
 * ScripForge — Death Replay & Kill Cam
 * Pack: Valorant Pack | Category: Feedback
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Rolling replay buffer of the killer's transform/state used to play back a short kill-cam after a death.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using System.Collections;
using System.Collections.Generic;
using UnityEngine;

namespace ScripForge.Valorant.Feedback
{
    /// <summary>
    /// A single sampled frame of an actor's transform state, captured at a fixed
    /// interval into a rolling buffer for later playback.
    /// </summary>
    public struct ReplayFrame
    {
        public float Timestamp;
        public Vector3 Position;
        public Quaternion Rotation;
        public bool WasFiring;
    }

    /// <summary>
    /// Attach to any actor that can be a "killer" — continuously records a short
    /// rolling buffer of its position/rotation/firing state. When that actor lands
    /// a kill, the buffer can be handed off to a DeathReplayKillCam to show the
    /// victim exactly how they died, from the killer's point of view.
    /// </summary>
    public class KillCamReplayRecorder : MonoBehaviour
    {
        [SerializeField] private float bufferLengthSeconds = 6f;
        [SerializeField] private float sampleIntervalSeconds = 0.05f;
        [SerializeField] private bool isCurrentlyFiring;

        private readonly Queue<ReplayFrame> _buffer = new Queue<ReplayFrame>();
        private float _sampleTimer;

        /// <summary>Call from the weapon-fire system to mark firing state for the recorded frames.</summary>
        public void SetFiringState(bool firing) => isCurrentlyFiring = firing;

        private void Update()
        {
            _sampleTimer += Time.deltaTime;
            if (_sampleTimer < sampleIntervalSeconds)
                return;

            _sampleTimer = 0f;

            _buffer.Enqueue(new ReplayFrame
            {
                Timestamp = Time.time,
                Position = transform.position,
                Rotation = transform.rotation,
                WasFiring = isCurrentlyFiring
            });

            while (_buffer.Count > 0 && Time.time - _buffer.Peek().Timestamp > bufferLengthSeconds)
            {
                _buffer.Dequeue();
            }
        }

        /// <summary>Snapshots the current buffer contents (e.g. at the moment a kill lands) for playback.</summary>
        public ReplayFrame[] CaptureSnapshot() => _buffer.ToArray();
    }

    /// <summary>
    /// Plays back a captured sequence of ReplayFrames on a dedicated kill-cam
    /// camera rig, giving the victim a short first-person(-ish) view of how the
    /// killing blow happened before returning control to the spectate/respawn flow.
    /// </summary>
    public class DeathReplayKillCam : MonoBehaviour
    {
        [SerializeField] private Transform killCamCameraRig;
        [Tooltip("Seconds of replay to show, counting back from the moment of death.")]
        [SerializeField] private float playbackWindowSeconds = 3f;
        [SerializeField] private float playbackSpeed = 1f;

        public bool IsPlaying { get; private set; }

        public event System.Action OnReplayStarted;
        public event System.Action OnReplayFinished;

        /// <summary>Begins playing back the given frame buffer, trimmed to the configured playback window.</summary>
        public void PlayReplay(ReplayFrame[] frames)
        {
            if (frames == null || frames.Length == 0 || IsPlaying)
                return;

            StartCoroutine(RunPlayback(TrimToWindow(frames)));
        }

        private ReplayFrame[] TrimToWindow(ReplayFrame[] frames)
        {
            float latestTimestamp = frames[frames.Length - 1].Timestamp;
            float cutoff = latestTimestamp - playbackWindowSeconds;

            var trimmed = new List<ReplayFrame>();
            foreach (ReplayFrame frame in frames)
            {
                if (frame.Timestamp >= cutoff)
                    trimmed.Add(frame);
            }
            return trimmed.ToArray();
        }

        private IEnumerator RunPlayback(ReplayFrame[] frames)
        {
            if (frames.Length < 2)
                yield break;

            IsPlaying = true;
            OnReplayStarted?.Invoke();

            float startTime = frames[0].Timestamp;
            float endTime = frames[frames.Length - 1].Timestamp;
            float elapsed = 0f;

            while (elapsed < (endTime - startTime))
            {
                float targetTimestamp = startTime + elapsed;
                ApplyInterpolatedFrame(frames, targetTimestamp);

                elapsed += Time.deltaTime * playbackSpeed;
                yield return null;
            }

            ApplyFrame(frames[frames.Length - 1]);

            IsPlaying = false;
            OnReplayFinished?.Invoke();
        }

        private void ApplyInterpolatedFrame(ReplayFrame[] frames, float targetTimestamp)
        {
            for (int i = 0; i < frames.Length - 1; i++)
            {
                if (targetTimestamp >= frames[i].Timestamp && targetTimestamp <= frames[i + 1].Timestamp)
                {
                    float t = Mathf.InverseLerp(frames[i].Timestamp, frames[i + 1].Timestamp, targetTimestamp);
                    Vector3 pos = Vector3.Lerp(frames[i].Position, frames[i + 1].Position, t);
                    Quaternion rot = Quaternion.Slerp(frames[i].Rotation, frames[i + 1].Rotation, t);

                    if (killCamCameraRig != null)
                    {
                        killCamCameraRig.SetPositionAndRotation(pos, rot);
                    }
                    return;
                }
            }
        }

        private void ApplyFrame(ReplayFrame frame)
        {
            if (killCamCameraRig != null)
            {
                killCamCameraRig.SetPositionAndRotation(frame.Position, frame.Rotation);
            }
        }
    }
}
