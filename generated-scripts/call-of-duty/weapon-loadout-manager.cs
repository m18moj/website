/*
 * ScriptForge — Custom Loadout & Gunsmith
 * Pack: Call of Duty Pack | Category: Weapons
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * A weapon customization and loadout persistence system with attachment slots and blueprint presets.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections.Generic;
using System.Linq;
using UnrealEngine;

namespace ScriptForge.Weapons
{
    /// <summary>Categories of attachment slots a weapon can expose.</summary>
    public enum AttachmentSlot
    {
        Optic,
        Muzzle,
        Barrel,
        Underbarrel,
        Magazine,
        Stock,
        Laser,
        RearGrip
    }

    [Serializable]
    public class Attachment
    {
        public string attachmentId;
        public string displayName;
        public AttachmentSlot slot;
        [TextArea] public string statSummary;
        public float damageModifier;
        public float recoilModifier;
        public float mobilityModifier;
        public float adsTimeModifier;
    }

    [Serializable]
    public class WeaponBlueprint
    {
        public string blueprintId;
        public string displayName;
        public string baseWeaponId;
        public List<Attachment> presetAttachments = new List<Attachment>();
        public bool isCustom;
    }

    [Serializable]
    public class LoadoutSlot
    {
        public string slotName = "Loadout 1";
        public string primaryWeaponId;
        public string secondaryWeaponId;
        public List<Attachment> primaryAttachments = new List<Attachment>();
        public List<Attachment> secondaryAttachments = new List<Attachment>();
        public string lethalId;
        public string tacticalId;
    }

    /// <summary>
    /// Manages weapon blueprints, attachment application/removal, and save-slot persistence
    /// for a player's custom loadouts. Attach to a persistent manager object (e.g. GameManager).
    /// </summary>
    public class WeaponLoadoutManager : MonoBehaviour
    {
        [Header("Configuration")]
        [SerializeField] private int maxLoadoutSlots = 10;
        [SerializeField] private int maxAttachmentsPerWeapon = 5;

        [Header("Runtime Data")]
        [SerializeField] private List<LoadoutSlot> loadoutSlots = new List<LoadoutSlot>();
        [SerializeField] private List<WeaponBlueprint> savedBlueprints = new List<WeaponBlueprint>();

        private int activeLoadoutIndex;

        public event Action<int> OnLoadoutChanged;
        public event Action<WeaponBlueprint> OnBlueprintSaved;

        private void Awake()
        {
            EnsureMinimumSlots();
        }

        private void EnsureMinimumSlots()
        {
            while (loadoutSlots.Count < 1)
            {
                loadoutSlots.Add(new LoadoutSlot { slotName = $"Loadout {loadoutSlots.Count + 1}" });
            }
        }

        /// <summary>Applies an attachment to the given weapon slot, enforcing one attachment per slot type.</summary>
        public bool ApplyAttachment(bool isPrimary, Attachment attachment)
        {
            LoadoutSlot loadout = loadoutSlots[activeLoadoutIndex];
            List<Attachment> targetList = isPrimary ? loadout.primaryAttachments : loadout.secondaryAttachments;

            if (targetList.Count >= maxAttachmentsPerWeapon && !targetList.Any(a => a.slot == attachment.slot))
            {
                Debug.LogWarning("Attachment limit reached for this weapon.");
                return false;
            }

            // Replace any existing attachment occupying the same slot.
            targetList.RemoveAll(a => a.slot == attachment.slot);
            targetList.Add(attachment);
            return true;
        }

        public void RemoveAttachment(bool isPrimary, AttachmentSlot slot)
        {
            LoadoutSlot loadout = loadoutSlots[activeLoadoutIndex];
            List<Attachment> targetList = isPrimary ? loadout.primaryAttachments : loadout.secondaryAttachments;
            targetList.RemoveAll(a => a.slot == slot);
        }

        /// <summary>Saves the current active loadout's primary weapon + attachments as a reusable blueprint.</summary>
        public WeaponBlueprint SaveAsBlueprint(string blueprintName)
        {
            LoadoutSlot loadout = loadoutSlots[activeLoadoutIndex];
            var blueprint = new WeaponBlueprint
            {
                blueprintId = Guid.NewGuid().ToString("N"),
                displayName = blueprintName,
                baseWeaponId = loadout.primaryWeaponId,
                presetAttachments = new List<Attachment>(loadout.primaryAttachments),
                isCustom = true
            };
            savedBlueprints.Add(blueprint);
            OnBlueprintSaved?.Invoke(blueprint);
            return blueprint;
        }

        public bool SwitchActiveLoadout(int index)
        {
            if (index < 0 || index >= loadoutSlots.Count) return false;
            activeLoadoutIndex = index;
            OnLoadoutChanged?.Invoke(index);
            return true;
        }

        public bool CreateLoadoutSlot(string slotName)
        {
            if (loadoutSlots.Count >= maxLoadoutSlots) return false;
            loadoutSlots.Add(new LoadoutSlot { slotName = slotName });
            return true;
        }

        public LoadoutSlot GetActiveLoadout() => loadoutSlots[activeLoadoutIndex];

        public float CalculateAggregateStat(Func<Attachment, float> selector, bool isPrimary)
        {
            var attachments = isPrimary
                ? loadoutSlots[activeLoadoutIndex].primaryAttachments
                : loadoutSlots[activeLoadoutIndex].secondaryAttachments;
            return attachments.Sum(selector);
        }
    }
}
