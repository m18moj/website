/*
 * ScriptForge — Killstreak & Scorestreak Chain
 * Pack: Call of Duty Pack | Category: Streaks
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Tracks streak progress toward reward thresholds and handles streak loss and care-package drops.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections.Generic;
using UnrealEngine;

namespace ScriptForge.Streaks
{
    [Serializable]
    public class StreakReward
    {
        public string rewardId;
        public string displayName;
        public int requiredPoints;
        public bool consumedOnUse = true;
        public GameObject carePackagePrefab;
    }

    /// <summary>
    /// Drives a scorestreak-style reward chain: accumulates points from kills/objective actions,
    /// unlocks rewards at thresholds, and resets progress on player death (streak-based mode).
    /// </summary>
    public class KillstreakController : MonoBehaviour
    {
        [Header("Streak Configuration")]
        [SerializeField] private List<StreakReward> streakChain = new List<StreakReward>();
        [SerializeField] private bool resetStreakOnDeath = true;
        [SerializeField] private bool useScoreBasedProgress = false;

        [Header("Care Package")]
        [SerializeField] private Transform carePackageDropPoint;
        [SerializeField] private float carePackageFallHeight = 15f;

        private int currentPoints;
        private readonly HashSet<string> earnedRewardIds = new HashSet<string>();

        public event Action<int> OnPointsChanged;
        public event Action<StreakReward> OnRewardUnlocked;
        public event Action OnStreakReset;

        /// <summary>Call when the player scores a kill (streak mode) or any score event (score mode).</summary>
        public void RegisterPoints(int amount)
        {
            if (amount <= 0) return;
            currentPoints += amount;
            OnPointsChanged?.Invoke(currentPoints);
            EvaluateThresholds();
        }

        /// <summary>Call from the player's death handler.</summary>
        public void HandlePlayerDeath()
        {
            if (resetStreakOnDeath && !useScoreBasedProgress)
            {
                currentPoints = 0;
                earnedRewardIds.Clear();
                OnStreakReset?.Invoke();
                OnPointsChanged?.Invoke(currentPoints);
            }
        }

        private void EvaluateThresholds()
        {
            foreach (StreakReward reward in streakChain)
            {
                if (earnedRewardIds.Contains(reward.rewardId)) continue;
                if (currentPoints >= reward.requiredPoints)
                {
                    UnlockReward(reward);
                }
            }
        }

        private void UnlockReward(StreakReward reward)
        {
            earnedRewardIds.Add(reward.rewardId);
            OnRewardUnlocked?.Invoke(reward);
        }

        /// <summary>Manually activates an already-unlocked streak reward (e.g. player pressed the streak key).</summary>
        public bool ActivateReward(string rewardId)
        {
            if (!earnedRewardIds.Contains(rewardId)) return false;

            StreakReward reward = streakChain.Find(r => r.rewardId == rewardId);
            if (reward == null) return false;

            if (reward.carePackagePrefab != null)
            {
                SpawnCarePackage(reward);
            }

            if (reward.consumedOnUse)
            {
                earnedRewardIds.Remove(rewardId);
                if (!useScoreBasedProgress)
                {
                    currentPoints = 0;
                    OnPointsChanged?.Invoke(currentPoints);
                }
            }
            return true;
        }

        private void SpawnCarePackage(StreakReward reward)
        {
            if (carePackageDropPoint == null) return;

            Vector3 spawnPos = carePackageDropPoint.position + Vector3.up * carePackageFallHeight;
            GameObject package = Instantiate(reward.carePackagePrefab, spawnPos, Quaternion.identity);

            Rigidbody rb = package.GetComponent<Rigidbody>();
            if (rb != null)
            {
                rb.linearVelocity = Vector3.down * 2f;
            }
        }

        public int GetCurrentPoints() => currentPoints;

        public bool IsRewardUnlocked(string rewardId) => earnedRewardIds.Contains(rewardId);

        public float GetProgressToNext()
        {
            foreach (StreakReward reward in streakChain)
            {
                if (!earnedRewardIds.Contains(reward.rewardId))
                {
                    return Mathf.Clamp01((float)currentPoints / reward.requiredPoints);
                }
            }
            return 1f;
        }
    }
}
