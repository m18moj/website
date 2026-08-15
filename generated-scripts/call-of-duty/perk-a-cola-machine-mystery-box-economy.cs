/*
 * ScripForge — Perk-a-Cola Machine & Mystery Box Economy
 * Pack: Call of Duty Pack | Category: Economy
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Between-round Mystery Box rolls and vending-machine perk purchases feeding a wave-survival economy.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections.Generic;
using UnrealEngine;

namespace ScripForge.Economy
{
    [Serializable]
    public class PerkDefinition
    {
        public string perkId;
        public string displayName;
        public int basePrice = 1500;
        public bool singleUsePerLife = false;
    }

    [Serializable]
    public class MysteryBoxEntry
    {
        public string itemId;
        public string displayName;
        public float weight = 1f;
        public GameObject rewardPrefab;
    }

    /// <summary>
    /// Drives a wave-survival economy: players spend earned credits on machine-gated perks and
    /// on rolling a weighted Mystery Box whose cost climbs with repeated use, then resets between rounds.
    /// </summary>
    public class PerkColaMysteryBoxEconomy : MonoBehaviour
    {
        [Header("Currency")]
        [SerializeField] private int startingCredits = 500;

        [Header("Perk Machines")]
        [SerializeField] private List<PerkDefinition> perkCatalog = new List<PerkDefinition>();

        [Header("Mystery Box")]
        [SerializeField] private List<MysteryBoxEntry> mysteryBoxPool = new List<MysteryBoxEntry>();
        [SerializeField] private int mysteryBoxBaseCost = 950;
        [SerializeField] private int mysteryBoxCostStep = 50;
        [SerializeField] private int mysteryBoxMaxCost = 2000;
        [SerializeField] private float boxMoveCooldownSeconds = 25f;

        private int currentCredits;
        private int mysteryBoxRollsThisRound;
        private float boxCooldownRemaining;
        private readonly HashSet<string> ownedPerkIds = new HashSet<string>();
        private readonly System.Random rng = new System.Random();

        public event Action<int> OnCreditsChanged;
        public event Action<PerkDefinition> OnPerkPurchased;
        public event Action<MysteryBoxEntry> OnMysteryBoxRolled;
        public event Action OnMysteryBoxOnCooldown;

        private void Awake()
        {
            currentCredits = startingCredits;
        }

        private void Update()
        {
            if (boxCooldownRemaining > 0f)
            {
                boxCooldownRemaining = Mathf.Max(0f, boxCooldownRemaining - Time.deltaTime);
            }
        }

        /// <summary>Call from kill/wave-clear/objective reward hooks.</summary>
        public void AddCredits(int amount)
        {
            if (amount <= 0) return;
            currentCredits += amount;
            OnCreditsChanged?.Invoke(currentCredits);
        }

        /// <summary>Attempts to buy the given perk from its vending machine. Returns false if the player can't afford it or already owns it.</summary>
        public bool TryPurchasePerk(string perkId)
        {
            PerkDefinition perk = perkCatalog.Find(p => p.perkId == perkId);
            if (perk == null || ownedPerkIds.Contains(perkId)) return false;
            if (currentCredits < perk.basePrice) return false;

            currentCredits -= perk.basePrice;
            ownedPerkIds.Add(perkId);
            OnCreditsChanged?.Invoke(currentCredits);
            OnPerkPurchased?.Invoke(perk);
            return true;
        }

        /// <summary>Rolls the box, deducting the current scaled price and starting the machine's move cooldown.</summary>
        public bool TryRollMysteryBox()
        {
            if (boxCooldownRemaining > 0f)
            {
                OnMysteryBoxOnCooldown?.Invoke();
                return false;
            }

            int cost = GetCurrentMysteryBoxCost();
            if (currentCredits < cost || mysteryBoxPool.Count == 0) return false;

            currentCredits -= cost;
            mysteryBoxRollsThisRound++;
            boxCooldownRemaining = boxMoveCooldownSeconds;

            MysteryBoxEntry result = RollWeightedEntry();
            OnCreditsChanged?.Invoke(currentCredits);
            OnMysteryBoxRolled?.Invoke(result);
            return true;
        }

        private MysteryBoxEntry RollWeightedEntry()
        {
            float totalWeight = 0f;
            foreach (MysteryBoxEntry entry in mysteryBoxPool) totalWeight += entry.weight;

            double roll = rng.NextDouble() * totalWeight;
            float cumulative = 0f;
            foreach (MysteryBoxEntry entry in mysteryBoxPool)
            {
                cumulative += entry.weight;
                if (roll <= cumulative) return entry;
            }
            return mysteryBoxPool[mysteryBoxPool.Count - 1];
        }

        public int GetCurrentMysteryBoxCost()
        {
            int scaled = mysteryBoxBaseCost + (mysteryBoxRollsThisRound * mysteryBoxCostStep);
            return Mathf.Min(scaled, mysteryBoxMaxCost);
        }

        /// <summary>Call when a new survival round begins to reset box pricing (perks and credits persist).</summary>
        public void OnRoundStart()
        {
            mysteryBoxRollsThisRound = 0;
            boxCooldownRemaining = 0f;
        }

        /// <summary>Call on player death when the run-level rules strip perks (classic zombies-style loss).</summary>
        public void ClearOwnedPerksOnDeath()
        {
            ownedPerkIds.Clear();
        }

        public bool OwnsPerk(string perkId) => ownedPerkIds.Contains(perkId);
        public int GetCurrentCredits() => currentCredits;
        public float GetBoxCooldownRemaining() => boxCooldownRemaining;
    }
}
