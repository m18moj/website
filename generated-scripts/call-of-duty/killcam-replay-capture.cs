/*
 * ScripForge — Killcam & Replay Capture
 * Pack: Call of Duty Pack | Category: Feedback
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Continuously captures a rolling buffer of transform/state snapshots so the last few seconds
 * before a death can be replayed as a killcam.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using System;
using System.Collections.Generic;
using UnityEngine;

namespace ScripForge.Feedback
{
    /// <summary>A single recorded snapshot of a tracked actor's state at one point in time.</summary>
    [Serializable]
    public struct ReplayFrame
    {
        public float timestamp;
        public Vector3 position;
        public Quaternion rotation;
        public bool isFiring;
        public bool isCrouched;
    }

    /// <summary>
    /// Records a rolling ring buffer of this actor's transform state every fixed interval,
    /// and exposes a snapshot of the last N seconds for killcam/replay playback on death.
    /// Attach to any actor whose recent movement should be replayable (typically the killer).
    /// </summary>
    public class KillcamReplayCapture : MonoBehaviour
    {
        [Header("Capture Settings")]
        [SerializeField] private float captureWindowSeconds = 6f;
        [SerializeField] private float sampleIntervalSeconds = 0.05f;

        [Header("Live State (read from your gameplay scripts)")]
        [SerializeField] private bool isFiring;
        [SerializeField] private bool isCrouched;

        private readonly LinkedList<ReplayFrame> _buffer = new LinkedList<ReplayFrame>();
        private float _sampleTimer;
        private float _clock;

        public event Action<List<ReplayFrame>> OnReplayCaptured;

        /// <summary>Call from your weapon/stance scripts so recorded frames reflect actual player actions.</summary>
        public void SetLiveState(bool firing, bool crouched)
        {
            isFiring = firing;
            isCrouched = crouched;
        }

        private void Update()
        {
            _clock += Time.deltaTime;
            _sampleTimer += Time.deltaTime;

            if (_sampleTimer < sampleIntervalSeconds) return;
            _sampleTimer = 0f;

            RecordFrame();
            TrimOldFrames();
        }

        private void RecordFrame()
        {
            _buffer.AddLast(new ReplayFrame
            {
                timestamp = _clock,
                position = transform.position,
                rotation = transform.rotation,
                isFiring = isFiring,
                isCrouched = isCrouched
            });
        }

        /// <summary>Drops frames older than the capture window to keep the buffer bounded.</summary>
        private void TrimOldFrames()
        {
            float cutoff = _clock - captureWindowSeconds;
            while (_buffer.Count > 0 && _buffer.First.Value.timestamp < cutoff)
            {
                _buffer.RemoveFirst();
            }
        }

        /// <summary>
        /// Call this the moment a death event fires (on the victim, referencing the killer's capture
        /// component) to pull the frames leading up to the kill for killcam playback.
        /// </summary>
        public List<ReplayFrame> CaptureKillcam()
        {
            var snapshot = new List<ReplayFrame>(_buffer);
            OnReplayCaptured?.Invoke(snapshot);
            return snapshot;
        }

        /// <summary>Utility for a playback controller: interpolates position/rotation between the two frames bracketing time t.</summary>
        public static bool TrySample(List<ReplayFrame> frames, float t, out Vector3 position, out Quaternion rotation)
        {
            position = Vector3.zero;
            rotation = Quaternion.identity;
            if (frames == null || frames.Count == 0) return false;

            for (int i = 0; i < frames.Count - 1; i++)
            {
                if (t >= frames[i].timestamp && t <= frames[i + 1].timestamp)
                {
                    float span = Mathf.Max(0.0001f, frames[i + 1].timestamp - frames[i].timestamp);
                    float lerp = (t - frames[i].timestamp) / span;
                    position = Vector3.Lerp(frames[i].position, frames[i + 1].position, lerp);
                    rotation = Quaternion.Slerp(frames[i].rotation, frames[i + 1].rotation, lerp);
                    return true;
                }
            }

            position = frames[frames.Count - 1].position;
            rotation = frames[frames.Count - 1].rotation;
            return true;
        }
    }
}
