/*
 * ScriptForge — Perk Package Builder
 * Pack: Call of Duty Pack | Category: Progression
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * A three-tier perk selection system with conflicting-perk validation and passive effect hooks.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections.Generic;
using System.Linq;
using UnrealEngine;

namespace ScriptForge.Progression
{
    public enum PerkTier
    {
        TierOne,
        TierTwo,
        TierThree
    }

    [Serializable]
    public class Perk
    {
        public string perkId;
        public string displayName;
        public PerkTier tier;
        [TextArea] public string description;
        public List<string> conflictingPerkIds = new List<string>();
    }

    /// <summary>
    /// Manages selection of one perk per tier, rejecting selections that conflict with an
    /// already-equipped perk (e.g. mutually exclusive movement perks). Broadcasts equip/unequip
    /// events so gameplay systems can apply/remove the associated passive effects.
    /// </summary>
    public class TacticalPerkSystem : MonoBehaviour
    {
        [Header("Available Perks")]
        [SerializeField] private List<Perk> perkPool = new List<Perk>();

        private readonly Dictionary<PerkTier, Perk> equippedPerks = new Dictionary<PerkTier, Perk>();

        public event Action<Perk> OnPerkEquipped;
        public event Action<Perk> OnPerkUnequipped;
        public event Action<Perk, Perk> OnPerkSelectionRejected; // attempted, conflictingWith

        /// <summary>Attempts to equip a perk into its tier slot. Fails if it conflicts with another equipped perk.</summary>
        public bool TryEquipPerk(string perkId)
        {
            Perk perk = perkPool.FirstOrDefault(p => p.perkId == perkId);
            if (perk == null)
            {
                Debug.LogWarning($"Perk '{perkId}' not found in pool.");
                return false;
            }

            Perk conflict = FindConflict(perk);
            if (conflict != null)
            {
                OnPerkSelectionRejected?.Invoke(perk, conflict);
                return false;
            }

            if (equippedPerks.TryGetValue(perk.tier, out Perk existing))
            {
                UnequipPerk(existing.tier);
            }

            equippedPerks[perk.tier] = perk;
            OnPerkEquipped?.Invoke(perk);
            return true;
        }

        private Perk FindConflict(Perk candidate)
        {
            foreach (Perk equipped in equippedPerks.Values)
            {
                if (equipped.perkId == candidate.perkId) continue;
                bool conflicts = equipped.conflictingPerkIds.Contains(candidate.perkId) ||
                                  candidate.conflictingPerkIds.Contains(equipped.perkId);
                if (conflicts) return equipped;
            }
            return null;
        }

        public void UnequipPerk(PerkTier tier)
        {
            if (!equippedPerks.TryGetValue(tier, out Perk perk)) return;
            equippedPerks.Remove(tier);
            OnPerkUnequipped?.Invoke(perk);
        }

        public Perk GetEquippedPerk(PerkTier tier) =>
            equippedPerks.TryGetValue(tier, out Perk perk) ? perk : null;

        public bool HasPerk(string perkId) =>
            equippedPerks.Values.Any(p => p.perkId == perkId);

        /// <summary>Returns true if the given package (one perk per tier) is internally valid.</summary>
        public bool ValidatePackage(IEnumerable<string> perkIds)
        {
            var perks = perkIds.Select(id => perkPool.FirstOrDefault(p => p.perkId == id))
                                .Where(p => p != null)
                                .ToList();

            for (int i = 0; i < perks.Count; i++)
            {
                for (int j = i + 1; j < perks.Count; j++)
                {
                    bool conflicts = perks[i].conflictingPerkIds.Contains(perks[j].perkId) ||
                                      perks[j].conflictingPerkIds.Contains(perks[i].perkId);
                    if (conflicts) return false;
                }
            }
            return true;
        }

        public IReadOnlyDictionary<PerkTier, Perk> GetAllEquipped() => equippedPerks;
    }
}
