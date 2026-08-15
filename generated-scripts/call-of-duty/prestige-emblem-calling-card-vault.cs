/*
 * ScripForge — Prestige Emblem & Calling Card Vault
 * Pack: Call of Duty Pack | Category: Progression
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Unlockable emblems and calling cards tied to prestige milestones, with a loadout-display vault.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections.Generic;
using System.Linq;
using UnrealEngine;

namespace ScripForge.Progression
{
    public enum VaultItemRarity
    {
        Common,
        Rare,
        Epic,
        Legendary
    }

    public interface IVaultUnlockable
    {
        string ItemId { get; }
        int RequiredPrestige { get; }
        VaultItemRarity Rarity { get; }
    }

    [Serializable]
    public class EmblemDefinition : IVaultUnlockable
    {
        [SerializeField] private string emblemId;
        [SerializeField] private int requiredPrestige;
        [SerializeField] private VaultItemRarity rarity = VaultItemRarity.Common;
        public Sprite icon;

        public string ItemId => emblemId;
        public int RequiredPrestige => requiredPrestige;
        public VaultItemRarity Rarity => rarity;
    }

    [Serializable]
    public class CallingCardDefinition : IVaultUnlockable
    {
        [SerializeField] private string cardId;
        [SerializeField] private int requiredPrestige;
        [SerializeField] private VaultItemRarity rarity = VaultItemRarity.Common;
        public string flavorText;
        public Texture2D artwork;

        public string ItemId => cardId;
        public int RequiredPrestige => requiredPrestige;
        public VaultItemRarity Rarity => rarity;
    }

    /// <summary>
    /// Tracks the player's prestige level and unlocks emblems/calling cards at configured milestones,
    /// exposing the current equipped identity for the loadout-display vault UI.
    /// </summary>
    public class PrestigeEmblemCallingCardVault : MonoBehaviour
    {
        private const string PrefsKeyPrestige = "SF_VaultPrestigeLevel";
        private const string PrefsKeyEmblem = "SF_VaultEquippedEmblem";
        private const string PrefsKeyCard = "SF_VaultEquippedCard";

        [SerializeField] private List<EmblemDefinition> emblemCatalog = new List<EmblemDefinition>();
        [SerializeField] private List<CallingCardDefinition> callingCardCatalog = new List<CallingCardDefinition>();

        private int prestigeLevel;
        private readonly HashSet<string> unlockedEmblemIds = new HashSet<string>();
        private readonly HashSet<string> unlockedCardIds = new HashSet<string>();

        private string equippedEmblemId;
        private string equippedCallingCardId;

        public event Action<int> OnPrestigeChanged;
        public event Action<IVaultUnlockable> OnItemUnlocked;
        public event Action<string, string> OnEquippedIdentityChanged; // (emblemId, callingCardId)

        private void Awake()
        {
            LoadState();
        }

        /// <summary>Call when the player completes a prestige reset. Unlocks any items gated at or below the new level.</summary>
        public void RegisterPrestige(int newPrestigeLevel)
        {
            if (newPrestigeLevel <= prestigeLevel) return;

            prestigeLevel = newPrestigeLevel;
            OnPrestigeChanged?.Invoke(prestigeLevel);
            EvaluateMilestoneUnlocks();
            SaveState();
        }

        private void EvaluateMilestoneUnlocks()
        {
            foreach (EmblemDefinition emblem in emblemCatalog)
            {
                if (!unlockedEmblemIds.Contains(emblem.ItemId) && prestigeLevel >= emblem.RequiredPrestige)
                {
                    unlockedEmblemIds.Add(emblem.ItemId);
                    OnItemUnlocked?.Invoke(emblem);
                }
            }

            foreach (CallingCardDefinition card in callingCardCatalog)
            {
                if (!unlockedCardIds.Contains(card.ItemId) && prestigeLevel >= card.RequiredPrestige)
                {
                    unlockedCardIds.Add(card.ItemId);
                    OnItemUnlocked?.Invoke(card);
                }
            }
        }

        public bool EquipEmblem(string emblemId)
        {
            if (!unlockedEmblemIds.Contains(emblemId)) return false;
            equippedEmblemId = emblemId;
            OnEquippedIdentityChanged?.Invoke(equippedEmblemId, equippedCallingCardId);
            SaveState();
            return true;
        }

        public bool EquipCallingCard(string cardId)
        {
            if (!unlockedCardIds.Contains(cardId)) return false;
            equippedCallingCardId = cardId;
            OnEquippedIdentityChanged?.Invoke(equippedEmblemId, equippedCallingCardId);
            SaveState();
            return true;
        }

        /// <summary>Returns every unlocked item, ordered highest rarity first, for the vault display grid.</summary>
        public List<IVaultUnlockable> GetVaultDisplayItems()
        {
            IEnumerable<IVaultUnlockable> unlockedEmblems = emblemCatalog.Where(e => unlockedEmblemIds.Contains(e.ItemId));
            IEnumerable<IVaultUnlockable> unlockedCards = callingCardCatalog.Where(c => unlockedCardIds.Contains(c.ItemId));
            return unlockedEmblems.Concat(unlockedCards)
                .OrderByDescending(item => (int)item.Rarity)
                .ToList();
        }

        public int GetPrestigeLevel() => prestigeLevel;
        public bool IsUnlocked(string itemId) => unlockedEmblemIds.Contains(itemId) || unlockedCardIds.Contains(itemId);

        private void SaveState()
        {
            PlayerPrefs.SetInt(PrefsKeyPrestige, prestigeLevel);
            PlayerPrefs.SetString(PrefsKeyEmblem, equippedEmblemId ?? string.Empty);
            PlayerPrefs.SetString(PrefsKeyCard, equippedCallingCardId ?? string.Empty);
            PlayerPrefs.Save();
        }

        private void LoadState()
        {
            prestigeLevel = PlayerPrefs.GetInt(PrefsKeyPrestige, 0);
            equippedEmblemId = PlayerPrefs.GetString(PrefsKeyEmblem, string.Empty);
            equippedCallingCardId = PlayerPrefs.GetString(PrefsKeyCard, string.Empty);
            EvaluateMilestoneUnlocks();
        }
    }
}
