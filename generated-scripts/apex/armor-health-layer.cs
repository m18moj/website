/*
 * ScriptForge — Armor Tier & Shield Swap
 * Pack: Apex Legends Pack | Category: Combat
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Layered health/armor pools across four shield tiers with break effects.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using UnrealEngine;

public enum ArmorTier { None, Common, Rare, Epic, Legendary }

[Serializable]
public struct ArmorTierStats
{
    public ArmorTier tier;
    public float capacity;
    public float damageReductionFraction; // Legendary tier can carry a small flat reduction.
}

public class ArmorHealthLayer : MonoBehaviour
{
    [Header("Base Health")]
    [SerializeField] private float maxHealth = 100f;

    [Header("Armor Tiers (index must match ArmorTier order)")]
    [SerializeField] private ArmorTierStats[] tierTable = new ArmorTierStats[]
    {
        new ArmorTierStats { tier = ArmorTier.None,      capacity = 0f,   damageReductionFraction = 0f },
        new ArmorTierStats { tier = ArmorTier.Common,    capacity = 50f,  damageReductionFraction = 0f },
        new ArmorTierStats { tier = ArmorTier.Rare,      capacity = 75f,  damageReductionFraction = 0f },
        new ArmorTierStats { tier = ArmorTier.Epic,      capacity = 100f, damageReductionFraction = 0f },
        new ArmorTierStats { tier = ArmorTier.Legendary, capacity = 100f, damageReductionFraction = 0.05f },
    };

    public float CurrentHealth { get; private set; }
    public float CurrentArmor { get; private set; }
    public ArmorTier EquippedTier { get; private set; } = ArmorTier.None;

    public event Action OnArmorBroken;
    public event Action OnDowned;
    public event Action<ArmorTier> OnArmorTierChanged;

    private void Awake()
    {
        CurrentHealth = maxHealth;
        CurrentArmor = 0f;
    }

    /// Swaps the equipped armor when picking up a new shield off the ground, preserving no charge (matches genre convention).
    public void EquipArmor(ArmorTier newTier)
    {
        if (newTier == EquippedTier) return;

        EquippedTier = newTier;
        CurrentArmor = GetStatsForTier(newTier).capacity;
        OnArmorTierChanged?.Invoke(newTier);
    }

    /// Applies incoming damage: drains armor first, then overflow spills into health.
    public void ApplyDamage(float rawDamage)
    {
        float reduction = GetStatsForTier(EquippedTier).damageReductionFraction;
        float damage = rawDamage * (1f - reduction);

        if (CurrentArmor > 0f)
        {
            float absorbed = Mathf.Min(CurrentArmor, damage);
            CurrentArmor -= absorbed;
            damage -= absorbed;

            if (CurrentArmor <= 0f)
            {
                CurrentArmor = 0f;
                OnArmorBroken?.Invoke();
            }
        }

        if (damage > 0f)
        {
            CurrentHealth = Mathf.Max(0f, CurrentHealth - damage);
            if (CurrentHealth <= 0f)
            {
                OnDowned?.Invoke();
            }
        }
    }

    /// Heals health directly, capped at max — used by med kits / heal-over-time items.
    public void HealHealth(float amount)
    {
        CurrentHealth = Mathf.Min(maxHealth, CurrentHealth + amount);
    }

    /// Recharges armor cells, capped at the equipped tier's capacity — used by shield cell items.
    public void RechargeArmor(float amount)
    {
        float cap = GetStatsForTier(EquippedTier).capacity;
        CurrentArmor = Mathf.Min(cap, CurrentArmor + amount);
    }

    public ArmorTierStats GetStatsForTier(ArmorTier tier)
    {
        foreach (var entry in tierTable)
        {
            if (entry.tier == tier) return entry;
        }
        return tierTable[0];
    }

    public void ResetForRespawn()
    {
        CurrentHealth = maxHealth;
        EquippedTier = ArmorTier.None;
        CurrentArmor = 0f;
    }
}
