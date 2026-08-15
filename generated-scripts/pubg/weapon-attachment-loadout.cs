/*
 * ScripForge — Weapon Attachment Loadout
 * Pack: PUBG Pack | Category: Weapons
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Scope/grip/magazine attachment slots with per-weapon compatibility rules and stacked stat modifiers.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using System;
using System.Collections.Generic;
using UnityEngine;

public enum AttachmentSlot { Scope, Muzzle, Grip, Magazine, Stock }

[Serializable]
public class AttachmentDefinition
{
    public string attachmentName;
    public AttachmentSlot slot;
    [Tooltip("Weapon category tags this attachment is compatible with, e.g. 'AR', 'SMG', 'DMR'.")]
    public string[] compatibleWeaponTags;

    [Header("Stat Modifiers (additive)")]
    public float recoilReduction;      // 0-1, fraction reduced.
    public float reloadSpeedBonus;     // 0-1, fraction faster.
    public float adsSpeedBonus;        // 0-1, fraction faster.
    public int magazineSizeBonus;      // Flat rounds added, magazines only.
    public float zoomMultiplier = 1f;  // Scopes only; 1 = no change.
}

[Serializable]
public class WeaponLoadoutProfile
{
    public string weaponName;
    public string weaponTag; // e.g. "AR"
    public int baseMagazineSize = 30;
    public float baseRecoil = 1f;
    public float baseReloadTime = 2.2f;
    public float baseAdsTime = 0.25f;
}

/// Manages equipped attachments for a single weapon instance and computes resulting stats.
public class WeaponAttachmentLoadout : MonoBehaviour
{
    [SerializeField] private WeaponLoadoutProfile weapon;

    private readonly Dictionary<AttachmentSlot, AttachmentDefinition> equipped = new Dictionary<AttachmentSlot, AttachmentDefinition>();

    public event Action<AttachmentSlot, AttachmentDefinition> OnAttachmentChanged;

    public void SetWeapon(WeaponLoadoutProfile profile)
    {
        weapon = profile;
        equipped.Clear();
    }

    /// Attempts to equip an attachment into its slot; fails if incompatible with the current weapon's tag.
    public bool TryEquipAttachment(AttachmentDefinition attachment)
    {
        if (attachment == null || weapon == null) return false;

        if (!IsCompatible(attachment)) return false;

        equipped[attachment.slot] = attachment;
        OnAttachmentChanged?.Invoke(attachment.slot, attachment);
        return true;
    }

    /// Removes whatever attachment currently occupies the given slot, if any.
    public void UnequipSlot(AttachmentSlot slot)
    {
        if (equipped.Remove(slot))
        {
            OnAttachmentChanged?.Invoke(slot, null);
        }
    }

    private bool IsCompatible(AttachmentDefinition attachment)
    {
        if (attachment.compatibleWeaponTags == null || attachment.compatibleWeaponTags.Length == 0) return true;

        foreach (string tag in attachment.compatibleWeaponTags)
        {
            if (string.Equals(tag, weapon.weaponTag, StringComparison.OrdinalIgnoreCase)) return true;
        }
        return false;
    }

    public AttachmentDefinition GetEquipped(AttachmentSlot slot)
    {
        return equipped.TryGetValue(slot, out AttachmentDefinition value) ? value : null;
    }

    /// Sums all equipped attachment modifiers on top of the weapon's base stats into a final effective stat block.
    public EffectiveWeaponStats ComputeEffectiveStats()
    {
        EffectiveWeaponStats stats = new EffectiveWeaponStats
        {
            magazineSize = weapon.baseMagazineSize,
            recoil = weapon.baseRecoil,
            reloadTime = weapon.baseReloadTime,
            adsTime = weapon.baseAdsTime,
            zoomMultiplier = 1f,
        };

        foreach (AttachmentDefinition attachment in equipped.Values)
        {
            stats.recoil *= Mathf.Clamp01(1f - attachment.recoilReduction);
            stats.reloadTime *= Mathf.Clamp01(1f - attachment.reloadSpeedBonus);
            stats.adsTime *= Mathf.Clamp01(1f - attachment.adsSpeedBonus);
            stats.magazineSize += attachment.magazineSizeBonus;
            if (attachment.slot == AttachmentSlot.Scope) stats.zoomMultiplier = attachment.zoomMultiplier;
        }

        return stats;
    }
}

[Serializable]
public struct EffectiveWeaponStats
{
    public int magazineSize;
    public float recoil;
    public float reloadTime;
    public float adsTime;
    public float zoomMultiplier;
}
