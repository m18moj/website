/*
 * ScripForge — Juggernaut Killstreak Suit System
 * Pack: Call of Duty Pack | Category: Streaks
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Heavy-armor killstreak suit with damage reduction, a minigun equip, and a timed duration countdown.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections.Generic;
using UnrealEngine;

namespace ScripForge.Streaks
{
    public enum JuggernautState
    {
        Inactive,
        Dropping,
        Active,
        Expired,
        Killed
    }

    /// <summary>
    /// Drives a Juggernaut-style heavy-armor killstreak: drops a suit crate, grants flat damage
    /// reduction and a minigun weapon swap once equipped, and counts down a fixed active duration
    /// (or ends early if the wearer is killed), broadcasting state changes for HUD/killfeed hooks.
    /// </summary>
    public class JuggernautKillstreakSuitSystem : MonoBehaviour
    {
        [Header("Crate Drop")]
        [SerializeField] private GameObject suitCratePrefab;
        [SerializeField] private float crateFallHeight = 25f;

        [Header("Suit Stats")]
        [Range(0f, 0.95f)]
        [SerializeField] private float damageReductionFraction = 0.6f;
        [SerializeField] private float suitDurationSeconds = 45f;
        [SerializeField] private GameObject minigunWeaponPrefab;
        [SerializeField] private float minigunSpinUpSeconds = 0.6f;

        [Header("Killstreak Requirement")]
        [SerializeField] private int requiredStreakPoints = 15;

        private JuggernautState currentState = JuggernautState.Inactive;
        private string activeWearerId;
        private float remainingDurationSeconds;
        private GameObject spawnedCrate;

        public event Action<string> OnSuitCrateDropped;
        public event Action<string> OnSuitEquipped;
        public event Action<string, float> OnDurationTick; // (wearerId, remainingSeconds)
        public event Action<string> OnSuitExpired;
        public event Action<string, string> OnWearerKilled; // (wearerId, killerId)

        private void Update()
        {
            if (currentState != JuggernautState.Active) return;

            remainingDurationSeconds = Mathf.Max(0f, remainingDurationSeconds - Time.deltaTime);
            OnDurationTick?.Invoke(activeWearerId, remainingDurationSeconds);

            if (remainingDurationSeconds <= 0f)
            {
                ExpireSuit();
            }
        }

        /// <summary>Call when a player's streak points cross the killstreak's threshold and they claim it.</summary>
        public bool TryClaimJuggernaut(string playerId, int currentStreakPoints, Vector3 dropPosition)
        {
            if (currentState != JuggernautState.Inactive) return false;
            if (currentStreakPoints < requiredStreakPoints) return false;

            activeWearerId = playerId;
            currentState = JuggernautState.Dropping;
            SpawnSuitCrate(dropPosition);
            OnSuitCrateDropped?.Invoke(playerId);
            return true;
        }

        private void SpawnSuitCrate(Vector3 dropPosition)
        {
            if (suitCratePrefab == null) return;

            Vector3 spawnPos = dropPosition + Vector3.up * crateFallHeight;
            spawnedCrate = Instantiate(suitCratePrefab, spawnPos, Quaternion.identity);
        }

        /// <summary>Call from the crate's pickup trigger once the claiming player reaches and interacts with it.</summary>
        public bool TryEquipSuit(string playerId)
        {
            if (currentState != JuggernautState.Dropping) return false;
            if (playerId != activeWearerId) return false;

            currentState = JuggernautState.Active;
            remainingDurationSeconds = suitDurationSeconds;

            if (spawnedCrate != null)
            {
                Destroy(spawnedCrate);
                spawnedCrate = null;
            }

            OnSuitEquipped?.Invoke(playerId);
            return true;
        }

        /// <summary>Call from the damage pipeline before applying damage to the active wearer.</summary>
        public float ApplyDamageReduction(string targetPlayerId, float incomingDamage)
        {
            if (currentState != JuggernautState.Active || targetPlayerId != activeWearerId)
            {
                return incomingDamage;
            }

            return incomingDamage * (1f - damageReductionFraction);
        }

        /// <summary>Call from the death handler when the active wearer is killed.</summary>
        public void ReportWearerKilled(string killerId)
        {
            if (currentState != JuggernautState.Active) return;

            string wearerId = activeWearerId;
            currentState = JuggernautState.Killed;
            OnWearerKilled?.Invoke(wearerId, killerId);
            ResetState();
        }

        private void ExpireSuit()
        {
            string wearerId = activeWearerId;
            currentState = JuggernautState.Expired;
            OnSuitExpired?.Invoke(wearerId);
            ResetState();
        }

        private void ResetState()
        {
            currentState = JuggernautState.Inactive;
            activeWearerId = null;
            remainingDurationSeconds = 0f;

            if (spawnedCrate != null)
            {
                Destroy(spawnedCrate);
                spawnedCrate = null;
            }
        }

        public GameObject GetMinigunPrefab() => minigunWeaponPrefab;
        public float GetMinigunSpinUpSeconds() => minigunSpinUpSeconds;
        public JuggernautState GetCurrentState() => currentState;
        public string GetActiveWearerId() => activeWearerId;

        public float GetRemainingDurationFraction()
        {
            if (suitDurationSeconds <= 0f) return 0f;
            return Mathf.Clamp01(remainingDurationSeconds / suitDurationSeconds);
        }

        public bool IsWearer(string playerId) => currentState == JuggernautState.Active && playerId == activeWearerId;
    }
}
