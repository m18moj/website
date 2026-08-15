/*
 * ScripForge — Replication Mode Ability Cooldown Reset
 * Pack: Valorant Pack | Category: Abilities
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * A single-agent replication variant that fast-resets ability cooldowns and removes ultimate cost.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections.Generic;
using UnrealEngine;

namespace ScripForge.Abilities
{
    /// <summary>
    /// Runtime tuning for a "replication" game mode where every combatant plays the same
    /// single agent and abilities cycle far faster than in standard competitive play.
    /// </summary>
    [Serializable]
    public class ReplicationModeSettings
    {
        [Tooltip("Multiplies every non-ultimate ability's cooldown duration (0.25 = 4x faster).")]
        [Range(0.05f, 1f)] public float cooldownScale = 0.25f;

        [Tooltip("When true, ultimates require zero charge accrual and are always ready.")]
        public bool ultimatesAlwaysReady = true;

        [Tooltip("Seconds after casting before a fast-reset ability becomes usable again, floor value.")]
        public float minimumCooldownSeconds = 0.5f;
    }

    /// <summary>
    /// Wraps a per-agent ability loadout and enforces replication-mode rules: every basic and
    /// signature ability cooldown is scaled down aggressively, and ultimates lose their normal
    /// point-cost gate entirely so they can be thrown as often as the (still-scaled) cooldown
    /// allows. Attach alongside the normal ability system and call through this wrapper instead
    /// of casting abilities directly while replication mode is active.
    /// </summary>
    public class ReplicationModeAbilityCooldownReset : MonoBehaviour
    {
        [Header("Mode Config")]
        public ReplicationModeSettings settings = new ReplicationModeSettings();
        public bool replicationModeActive;

        [Header("Tracked Abilities")]
        [Tooltip("Base (unscaled) cooldowns as defined by the normal competitive ruleset, keyed by abilityId.")]
        public List<string> abilityIds = new List<string>();
        public List<float> baseCooldownSeconds = new List<float>();
        public string ultimateAbilityId;

        public event Action<string> OnAbilityReadyEarly;
        public event Action OnUltimateUnlockedFree;

        private readonly Dictionary<string, float> _cooldownEndTime = new Dictionary<string, float>();
        private readonly Dictionary<string, float> _baseCooldownLookup = new Dictionary<string, float>();

        private void Awake()
        {
            for (int i = 0; i < abilityIds.Count && i < baseCooldownSeconds.Count; i++)
            {
                _baseCooldownLookup[abilityIds[i]] = baseCooldownSeconds[i];
                _cooldownEndTime[abilityIds[i]] = 0f;
            }
        }

        /// <summary>Call the instant this ability is fired, in place of the normal cooldown-start hook.</summary>
        public void NotifyAbilityCast(string abilityId)
        {
            if (abilityId == ultimateAbilityId && replicationModeActive && settings.ultimatesAlwaysReady)
            {
                // Ultimates in replication mode aren't gated by cast at all — nothing to start.
                _cooldownEndTime[abilityId] = Time.time;
                OnUltimateUnlockedFree?.Invoke();
                return;
            }

            float duration = ResolveCooldownDuration(abilityId);
            _cooldownEndTime[abilityId] = Time.time + duration;
        }

        /// <summary>Whether the ability may currently be cast, honoring the replication-mode scale.</summary>
        public bool IsAbilityReady(string abilityId)
        {
            if (abilityId == ultimateAbilityId && replicationModeActive && settings.ultimatesAlwaysReady)
                return true;

            return !_cooldownEndTime.TryGetValue(abilityId, out float endTime) || Time.time >= endTime;
        }

        public float GetRemainingCooldown(string abilityId)
        {
            if (!_cooldownEndTime.TryGetValue(abilityId, out float endTime)) return 0f;
            return Mathf.Max(0f, endTime - Time.time);
        }

        /// <summary>
        /// Instantly clears a specific ability's remaining cooldown, used for the "kill refunds a
        /// charge" style perks some replication variants grant on elimination.
        /// </summary>
        public void ForceReady(string abilityId)
        {
            if (!_cooldownEndTime.ContainsKey(abilityId)) return;
            _cooldownEndTime[abilityId] = Time.time;
            OnAbilityReadyEarly?.Invoke(abilityId);
        }

        /// <summary>Toggling replication mode mid-match immediately re-derives all active cooldowns.</summary>
        public void SetReplicationModeActive(bool active)
        {
            if (replicationModeActive == active) return;
            replicationModeActive = active;

            foreach (var abilityId in abilityIds)
            {
                if (!_cooldownEndTime.TryGetValue(abilityId, out float endTime)) continue;
                float remaining = endTime - Time.time;
                if (remaining <= 0f) continue;

                float baseRemaining = active ? remaining * settings.cooldownScale : remaining / settings.cooldownScale;
                _cooldownEndTime[abilityId] = Time.time + Mathf.Max(0f, baseRemaining);
            }
        }

        private float ResolveCooldownDuration(string abilityId)
        {
            float baseDuration = _baseCooldownLookup.TryGetValue(abilityId, out var d) ? d : 0f;
            if (!replicationModeActive) return baseDuration;

            float scaled = baseDuration * settings.cooldownScale;
            return Mathf.Max(settings.minimumCooldownSeconds, scaled);
        }
    }
}
