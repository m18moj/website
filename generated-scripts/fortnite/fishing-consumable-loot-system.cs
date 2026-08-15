/*
 * ScripForge — Fishing & Consumable Loot System
 * Pack: Fortnite Pack | Category: Gameplay
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Fishing-spot interaction that yields a random weapon, consumable, or healing item after a timed catch.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using System.Collections;
using System.Collections.Generic;
using UnityEngine;

namespace ScripForge.Fortnite.Gameplay
{
    public enum CatchRewardType
    {
        Junk,
        Consumable,
        HealingItem,
        Weapon,
        RareWeapon
    }

    [System.Serializable]
    public struct CatchReward
    {
        public CatchRewardType rewardType;
        [Range(0f, 1f)] public float weight;
        public GameObject rewardPrefab;
    }

    /// <summary>
    /// Attach to a fishing spot (typically a small water trigger volume). A player interacts
    /// to cast a line; after a randomized bite delay and a short reel-in window, a reward is
    /// spawned into the player's hands/inventory based on a weighted loot table.
    /// </summary>
    public class FishingConsumableLootSystem : MonoBehaviour
    {
        [Header("Timing")]
        [SerializeField] private float minBiteDelay = 2f;
        [SerializeField] private float maxBiteDelay = 8f;
        [SerializeField] private float reelWindowDuration = 1.5f;

        [Header("Rewards")]
        [SerializeField] private List<CatchReward> rewardTable = new List<CatchReward>();

        [Header("State")]
        [SerializeField] private bool isFishing;
        [SerializeField] private bool biteReady;

        private Coroutine fishingRoutine;

        public bool IsFishing => isFishing;
        public bool BiteReady => biteReady;

        public delegate void CaughtHandler(CatchRewardType type, GameObject rewardInstance);
        public event CaughtHandler OnCaught;
        public delegate void MissedHandler();
        public event MissedHandler OnMissed;

        /// <summary>Begins a fishing attempt at this spot for the given player.</summary>
        public bool StartFishing(Transform player)
        {
            if (isFishing)
                return false;

            isFishing = true;
            biteReady = false;
            fishingRoutine = StartCoroutine(FishingSequence(player));
            return true;
        }

        /// <summary>Call when the player presses the reel-in input; only succeeds during the bite window.</summary>
        public bool TryReelIn(Transform player)
        {
            if (!isFishing || !biteReady)
                return false;

            CatchReward reward = RollReward();
            SpawnReward(reward, player);
            OnCaught?.Invoke(reward.rewardType, reward.rewardPrefab);

            StopFishingInternal();
            return true;
        }

        /// <summary>Cancels an in-progress fishing attempt (e.g. player moves away or takes damage).</summary>
        public void CancelFishing()
        {
            if (!isFishing)
                return;

            StopFishingInternal();
        }

        private void StopFishingInternal()
        {
            if (fishingRoutine != null)
            {
                StopCoroutine(fishingRoutine);
                fishingRoutine = null;
            }
            isFishing = false;
            biteReady = false;
        }

        private IEnumerator FishingSequence(Transform player)
        {
            float delay = Random.Range(minBiteDelay, maxBiteDelay);
            yield return new WaitForSeconds(delay);

            biteReady = true;

            float timer = 0f;
            while (timer < reelWindowDuration)
            {
                timer += Time.deltaTime;
                yield return null;
            }

            // Bite window expired without a reel-in: fish gets away.
            biteReady = false;
            isFishing = false;
            fishingRoutine = null;
            OnMissed?.Invoke();
        }

        private CatchReward RollReward()
        {
            float totalWeight = 0f;
            foreach (var r in rewardTable)
                totalWeight += r.weight;

            if (totalWeight <= 0f || rewardTable.Count == 0)
                return default;

            float roll = Random.Range(0f, totalWeight);
            float cumulative = 0f;

            foreach (var r in rewardTable)
            {
                cumulative += r.weight;
                if (roll <= cumulative)
                    return r;
            }

            return rewardTable[rewardTable.Count - 1];
        }

        private void SpawnReward(CatchReward reward, Transform player)
        {
            if (reward.rewardPrefab == null || player == null)
                return;

            Vector3 spawnPos = player.position + player.forward * 0.5f + Vector3.up * 1f;
            Instantiate(reward.rewardPrefab, spawnPos, Quaternion.identity);
        }
    }
}
