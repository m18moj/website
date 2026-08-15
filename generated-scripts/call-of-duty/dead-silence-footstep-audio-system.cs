/*
 * ScripForge — Dead Silence & Footstep Audio
 * Pack: Call of Duty Pack | Category: Audio
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Footstep audio falloff by surface and stance with a timed Dead Silence-style perk that suppresses movement noise.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections.Generic;
using UnrealEngine;

namespace ScripForge.Audio
{
    public enum FootstepSurface
    {
        Concrete,
        Metal,
        Wood,
        Grass,
        Gravel,
        Water,
        Snow
    }

    public enum MovementStance
    {
        Standing,
        Crouched,
        Prone
    }

    [Serializable]
    public class SurfaceFootstepProfile
    {
        public FootstepSurface surface;
        public List<AudioClip> footstepClips = new List<AudioClip>();
        [Tooltip("Base audible radius in meters at standing, unsuppressed volume.")]
        public float baseAudibleRadius = 12f;
        [Range(0f, 1f)] public float baseVolume = 1f;
    }

    /// <summary>
    /// Computes footstep audio falloff based on surface type and movement stance, exposes the
    /// resulting audible radius for enemy footstep-sound propagation, and layers in a timed
    /// Dead Silence-style perk that suppresses noise (and optionally caps radius) while active.
    /// </summary>
    public class DeadSilenceFootstepAudioSystem : MonoBehaviour
    {
        [Header("Surface Profiles")]
        [SerializeField] private List<SurfaceFootstepProfile> surfaceProfiles = new List<SurfaceFootstepProfile>();
        [SerializeField] private AudioSource footstepSource;

        [Header("Stance Multipliers")]
        [SerializeField] private float standingRadiusMultiplier = 1f;
        [SerializeField] private float crouchedRadiusMultiplier = 0.55f;
        [SerializeField] private float proneRadiusMultiplier = 0.2f;

        [Header("Dead Silence Perk")]
        [SerializeField] private float deadSilenceDurationSeconds = 20f;
        [Tooltip("Fraction of normal audible radius while Dead Silence is active. 0 = fully silent.")]
        [Range(0f, 1f)] private float deadSilenceRadiusFraction = 0f;
        [Range(0f, 1f)] private float deadSilenceVolumeFraction = 0.1f;

        private MovementStance currentStance = MovementStance.Standing;
        private float deadSilenceRemaining;

        public event Action<float> OnDeadSilenceActivated;
        public event Action OnDeadSilenceExpired;
        public event Action<float, float> OnFootstepEmitted; // (audibleRadius, volume)

        private void Update()
        {
            if (deadSilenceRemaining <= 0f) return;

            deadSilenceRemaining = Mathf.Max(0f, deadSilenceRemaining - Time.deltaTime);
            if (deadSilenceRemaining <= 0f)
            {
                OnDeadSilenceExpired?.Invoke();
            }
        }

        public void SetStance(MovementStance stance)
        {
            currentStance = stance;
        }

        /// <summary>Call from the footstep animation event or movement tick to play and propagate a footstep.</summary>
        public void EmitFootstep(FootstepSurface surface)
        {
            SurfaceFootstepProfile profile = surfaceProfiles.Find(p => p.surface == surface);
            if (profile == null) return;

            float stanceMultiplier = GetStanceMultiplier();
            float audibleRadius = profile.baseAudibleRadius * stanceMultiplier;
            float volume = profile.baseVolume * stanceMultiplier;

            bool deadSilenceActive = IsDeadSilenceActive();
            if (deadSilenceActive)
            {
                audibleRadius *= deadSilenceRadiusFraction;
                volume *= deadSilenceVolumeFraction;
            }

            PlayFootstepClip(profile, volume);
            OnFootstepEmitted?.Invoke(audibleRadius, volume);
        }

        private void PlayFootstepClip(SurfaceFootstepProfile profile, float volume)
        {
            if (footstepSource == null || profile.footstepClips.Count == 0) return;

            AudioClip clip = profile.footstepClips[UnityEngine.Random.Range(0, profile.footstepClips.Count)];
            footstepSource.PlayOneShot(clip, Mathf.Clamp01(volume));
        }

        private float GetStanceMultiplier()
        {
            switch (currentStance)
            {
                case MovementStance.Crouched: return crouchedRadiusMultiplier;
                case MovementStance.Prone: return proneRadiusMultiplier;
                default: return standingRadiusMultiplier;
            }
        }

        /// <summary>Call when the player activates their Dead Silence field upgrade or perk pickup.</summary>
        public void ActivateDeadSilence()
        {
            deadSilenceRemaining = deadSilenceDurationSeconds;
            OnDeadSilenceActivated?.Invoke(deadSilenceRemaining);
        }

        /// <summary>Extends an already-active Dead Silence window, capped at the configured duration.</summary>
        public void ExtendDeadSilence(float extraSeconds)
        {
            if (deadSilenceRemaining <= 0f) return;
            deadSilenceRemaining = Mathf.Min(deadSilenceDurationSeconds, deadSilenceRemaining + extraSeconds);
        }

        public bool IsDeadSilenceActive() => deadSilenceRemaining > 0f;

        public float GetDeadSilenceRemainingFraction()
        {
            if (deadSilenceDurationSeconds <= 0f) return 0f;
            return Mathf.Clamp01(deadSilenceRemaining / deadSilenceDurationSeconds);
        }

        public MovementStance GetCurrentStance() => currentStance;
    }
}
