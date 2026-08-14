/*
 * ScriptForge — Weapon Attachment & Hop-Up System
 * Pack: Apex Legends Pack | Category: Weapons
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Slot-based weapon attachment framework where optics, mags, stocks and hop-ups layer stat modifiers onto a base weapon.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using System;
using System.Collections.Generic;
using UnityEngine;

public enum AttachmentSlot { Optic, Magazine, Barrel, Stock, HopUp }

[Serializable]
public struct AttachmentModifier
{
    public AttachmentSlot slot;
    public string attachmentName;
    [Range(0, 5)] public int tierLevel;

    [Header("Stat Deltas")]
    public float damageMultiplier;      // Multiplicative, e.g. 1.15 = +15% damage.
    public float reloadSpeedMultiplier; // Lower is faster; 0.9 = 10% faster reload.
    public int magazineSizeBonus;       // Flat additive rounds.
    public float adsSpeedMultiplier;    // Lower is faster ADS.
    public float hipFireSpreadMultiplier;

    public static AttachmentModifier Identity(AttachmentSlot slot) => new AttachmentModifier
    {
        slot = slot,
        attachmentName = "None",
        damageMultiplier = 1f,
        reloadSpeedMultiplier = 1f,
        magazineSizeBonus = 0,
        adsSpeedMultiplier = 1f,
        hipFireSpreadMultiplier = 1f
    };
}

[Serializable]
public struct WeaponBaseStats
{
    public float baseDamage;
    public float baseReloadTime;
    public int baseMagazineSize;
    public float baseAdsTime;
    public float baseHipFireSpread;
}

/// Aggregates a base weapon with per-slot attachment modifiers to produce final live stats.
public class WeaponAttachmentSystem : MonoBehaviour
{
    [SerializeField] private WeaponBaseStats baseStats = new WeaponBaseStats
    {
        baseDamage = 18f,
        baseReloadTime = 2.2f,
        baseMagazineSize = 20,
        baseAdsTime = 0.25f,
        baseHipFireSpread = 3.5f
    };

    private readonly Dictionary<AttachmentSlot, AttachmentModifier> equipped = new Dictionary<AttachmentSlot, AttachmentModifier>();

    public event Action<AttachmentSlot, AttachmentModifier> OnAttachmentChanged;
    public event Action OnStatsRecalculated;

    public WeaponBaseStats CurrentStats { get; private set; }

    private void Awake()
    {
        foreach (AttachmentSlot slot in Enum.GetValues(typeof(AttachmentSlot)))
        {
            equipped[slot] = AttachmentModifier.Identity(slot);
        }
        RecalculateStats();
    }

    /// Equips an attachment into its slot, replacing whatever occupied it (higher tier auto-overwrites lower on pickup).
    public bool AttachAttachment(AttachmentModifier modifier)
    {
        if (equipped.TryGetValue(modifier.slot, out var current) && current.tierLevel > modifier.tierLevel)
        {
            return false; // Don't allow downgrading an equipped attachment.
        }

        equipped[modifier.slot] = modifier;
        OnAttachmentChanged?.Invoke(modifier.slot, modifier);
        RecalculateStats();
        return true;
    }

    /// Strips a slot back to its unmodified identity, e.g. when dropping an attachment for a squadmate.
    public void RemoveAttachment(AttachmentSlot slot)
    {
        equipped[slot] = AttachmentModifier.Identity(slot);
        OnAttachmentChanged?.Invoke(slot, equipped[slot]);
        RecalculateStats();
    }

    public AttachmentModifier GetEquipped(AttachmentSlot slot) => equipped[slot];

    /// Folds every equipped modifier into the base stats to produce the weapon's current effective stats.
    private void RecalculateStats()
    {
        var result = baseStats;

        foreach (var mod in equipped.Values)
        {
            result.baseDamage *= mod.damageMultiplier;
            result.baseReloadTime *= mod.reloadSpeedMultiplier;
            result.baseMagazineSize += mod.magazineSizeBonus;
            result.baseAdsTime *= mod.adsSpeedMultiplier;
            result.baseHipFireSpread *= mod.hipFireSpreadMultiplier;
        }

        CurrentStats = result;
        OnStatsRecalculated?.Invoke();
    }
}
