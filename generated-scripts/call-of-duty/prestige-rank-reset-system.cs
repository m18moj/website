/*
 * ScripForge — Prestige & Rank Reset System
 * Pack: Call of Duty Pack | Category: Progression
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Handles prestige-tier rank resets while preserving a curated set of carried-over cosmetic unlocks.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace ScripForge.Progression
{
    /// <summary>Defines which unlock categories survive a prestige reset.</summary>
    [Flags]
    public enum CarryOverFlags
    {
        None = 0,
        Weapons = 1 << 0,
        Attachments = 1 << 1,
        Operators = 1 << 2,
        CamosAndSkins = 1 << 3,
        Emblems = 1 << 4
    }

    [Serializable]
    public class PrestigeTier
    {
        public int prestigeLevel;
        public string tierName;
        public string rewardEmblemId;
        public CarryOverFlags carryOver = CarryOverFlags.Operators | CarryOverFlags.CamosAndSkins | CarryOverFlags.Emblems;
    }

    /// <summary>
    /// Manages the player's current rank/XP, and performs a prestige reset once max rank is reached,
    /// wiping rank-gated progress while preserving unlocks flagged for carry-over.
    /// </summary>
    public class PrestigeRankResetSystem : MonoBehaviour
    {
        [Header("Rank Configuration")]
        [SerializeField] private int maxRank = 55;
        [SerializeField] private int xpPerRank = 5000;
        [SerializeField] private List<PrestigeTier> prestigeTiers = new List<PrestigeTier>();
        [SerializeField] private int maxPrestigeLevel = 10;

        [Header("Runtime State")]
        [SerializeField] private int currentRank = 1;
        [SerializeField] private int currentXp;
        [SerializeField] private int currentPrestige;
        [SerializeField] private List<string> unlockedWeaponIds = new List<string>();
        [SerializeField] private List<string> unlockedAttachmentIds = new List<string>();
        [SerializeField] private List<string> unlockedOperatorIds = new List<string>();
        [SerializeField] private List<string> unlockedCosmeticIds = new List<string>();
        [SerializeField] private List<string> unlockedEmblemIds = new List<string>();

        public event Action<int> OnRankUp;
        public event Action<int> OnPrestiged;
        public event Action OnMaxPrestigeReached;

        /// <summary>Adds XP and rolls it into rank-ups, one rank at a time.</summary>
        public void AddExperience(int amount)
        {
            currentXp += Mathf.Max(0, amount);

            while (currentXp >= xpPerRank && currentRank < maxRank)
            {
                currentXp -= xpPerRank;
                currentRank++;
                OnRankUp?.Invoke(currentRank);
            }

            if (currentRank >= maxRank)
            {
                currentXp = Mathf.Min(currentXp, xpPerRank);
            }
        }

        public bool CanPrestige() => currentRank >= maxRank && currentPrestige < maxPrestigeLevel;

        /// <summary>Performs the prestige reset: rank/XP wiped, only carry-over-flagged unlocks preserved.</summary>
        public bool PerformPrestige()
        {
            if (!CanPrestige()) return false;

            currentPrestige++;
            var tier = prestigeTiers.FirstOrDefault(t => t.prestigeLevel == currentPrestige)
                       ?? new PrestigeTier { prestigeLevel = currentPrestige, tierName = $"Prestige {currentPrestige}" };

            if ((tier.carryOver & CarryOverFlags.Weapons) == 0) unlockedWeaponIds.Clear();
            if ((tier.carryOver & CarryOverFlags.Attachments) == 0) unlockedAttachmentIds.Clear();
            if ((tier.carryOver & CarryOverFlags.Operators) == 0) unlockedOperatorIds.Clear();
            if ((tier.carryOver & CarryOverFlags.CamosAndSkins) == 0) unlockedCosmeticIds.Clear();
            if ((tier.carryOver & CarryOverFlags.Emblems) == 0) unlockedEmblemIds.Clear();

            if (!string.IsNullOrEmpty(tier.rewardEmblemId) && !unlockedEmblemIds.Contains(tier.rewardEmblemId))
            {
                unlockedEmblemIds.Add(tier.rewardEmblemId);
            }

            currentRank = 1;
            currentXp = 0;

            OnPrestiged?.Invoke(currentPrestige);

            if (currentPrestige >= maxPrestigeLevel)
            {
                OnMaxPrestigeReached?.Invoke();
            }

            return true;
        }

        public (int rank, int prestige, float xpFraction) GetProgressSnapshot()
        {
            return (currentRank, currentPrestige, (float)currentXp / xpPerRank);
        }
    }
}
