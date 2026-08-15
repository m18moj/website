/*
 * ScripForge — Positional Audio & Footstep Callouts
 * Pack: Valorant Pack | Category: Audio
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * 3D positional audio for footsteps/abilities feeding an auto-callout system.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections.Generic;
using UnrealEngine;

namespace ScripForge.Audio
{
    public enum SoundCategory { Footstep, AbilityCast, WeaponFire, Reload }

    [Serializable]
    public struct AudibleEvent
    {
        public SoundCategory category;
        public Vector3 worldPosition;
        public string emitterPlayerId;
        public float baseRadius;   // Max distance at which this sound can be heard/callouted.
        public bool enemyTeam;     // Relative to the listener registering the callout.
    }

    /// <summary>
    /// Emits 3D positional audio for a footstep/ability/weapon source and reports the event
    /// to any subscribed AutoCalloutListener so nearby enemies can be surfaced on the minimap/HUD.
    /// Attach to each player's feet/weapon emitter point.
    /// </summary>
    public class PositionalSoundEmitter : MonoBehaviour
    {
        [Header("Identity")]
        public string ownerPlayerId;

        [Header("Audio")]
        public AudioSource audioSource;
        public AudioClip[] footstepClips;
        [Range(0f, 1f)] public float crouchVolumeMultiplier = 0.35f;

        [Header("Callout Radii (meters)")]
        public float footstepRadius = 18f;
        public float footstepRadiusCrouched = 6f;
        public float abilityRadius = 25f;

        public static event Action<AudibleEvent> OnAudibleEventEmitted;

        /// <summary>Call from the movement controller's footstep animation event.</summary>
        public void PlayFootstep(bool isCrouched, bool isRunning)
        {
            if (audioSource != null && footstepClips.Length > 0)
            {
                var clip = footstepClips[UnityEngine.Random.Range(0, footstepClips.Length)];
                float volume = isCrouched ? crouchVolumeMultiplier : (isRunning ? 1f : 0.7f);
                audioSource.PlayOneShot(clip, volume);
            }

            float radius = isCrouched ? footstepRadiusCrouched : footstepRadius;
            if (!isCrouched || isRunning)
            {
                Broadcast(SoundCategory.Footstep, radius);
            }
        }

        /// <summary>Call when an ability is cast; loud abilities should use a larger radius.</summary>
        public void PlayAbilityCast(AudioClip clip, float customRadius = -1f)
        {
            if (audioSource != null && clip != null)
                audioSource.PlayOneShot(clip);

            Broadcast(SoundCategory.AbilityCast, customRadius > 0f ? customRadius : abilityRadius);
        }

        private void Broadcast(SoundCategory category, float radius)
        {
            OnAudibleEventEmitted?.Invoke(new AudibleEvent
            {
                category = category,
                worldPosition = transform.position,
                emitterPlayerId = ownerPlayerId,
                baseRadius = radius
            });
        }
    }

    /// <summary>
    /// Sits on the local player's listener rig. Subscribes to all emitted sounds and surfaces
    /// nearby, in-range enemy sounds as HUD "callout" pings (direction + distance banding).
    /// </summary>
    public class AutoCalloutListener : MonoBehaviour
    {
        public string localPlayerId;
        public Func<string, string, bool> IsEnemyOf; // (localId, otherId) => true if hostile.

        public event Action<Vector3, SoundCategory, float> OnCalloutRaised; // direction, category, distance

        private void OnEnable() => PositionalSoundEmitter.OnAudibleEventEmitted += HandleAudibleEvent;
        private void OnDisable() => PositionalSoundEmitter.OnAudibleEventEmitted -= HandleAudibleEvent;

        private void HandleAudibleEvent(AudibleEvent evt)
        {
            if (evt.emitterPlayerId == localPlayerId) return;
            if (IsEnemyOf != null && !IsEnemyOf(localPlayerId, evt.emitterPlayerId)) return;

            float distance = Vector3.Distance(transform.position, evt.worldPosition);
            if (distance > evt.baseRadius) return;

            Vector3 direction = (evt.worldPosition - transform.position).normalized;
            OnCalloutRaised?.Invoke(direction, evt.category, distance);
        }
    }
}
