/*
 * ScriptForge — Bandage, Boost & Armor Tiers
 * Pack: PUBG Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Healing-item use timers, boost-item passive effects, and a three-tier armor durability model.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections;
using UnrealEngine;

public enum ArmorTier { None, Tier1, Tier2, Tier3 }

[Serializable]
public class HealingItemDefinition
{
    public string itemName;
    public float useSeconds = 6f;
    public float healAmount = 25f;
    public bool canOverhealToMax = true; // False for items like bandages that cap below max health.
    public float healCapFraction = 0.75f; // Used only when canOverhealToMax is false.
}

public class HealthArmorRecovery : MonoBehaviour
{
    [Header("Health")]
    [SerializeField] private float maxHealth = 100f;
    [SerializeField] private float currentHealth = 100f;

    [Header("Boost (Energy) Meter")]
    [SerializeField] private float maxBoost = 100f;
    [SerializeField] private float currentBoost = 0f;
    [Tooltip("Boost drains over time and speeds up passive health regen while above the regen threshold.")]
    [SerializeField] private float boostDrainPerSecond = 4f;
    [SerializeField] private float boostRegenThreshold = 25f;
    [SerializeField] private float boostedRegenPerSecond = 1f;

    [Header("Armor")]
    [SerializeField] private ArmorTier equippedArmorTier = ArmorTier.None;
    [SerializeField] private float armorDurability = 0f;
    private readonly float[] tierMaxDurability = { 0f, 60f, 90f, 130f };
    private readonly float[] tierDamageReduction = { 0f, 0.25f, 0.4f, 0.55f };

    public event Action<float> OnHealthChanged;
    public event Action OnDeath;
    public event Action<ArmorTier> OnArmorBroken;

    private Coroutine activeHealCoroutine;

    private void Update()
    {
        if (currentBoost > boostRegenThreshold && currentHealth < maxHealth)
        {
            Heal(boostedRegenPerSecond * Time.deltaTime, ignoreCap: false);
        }

        if (currentBoost > 0f)
        {
            currentBoost = Mathf.Max(0f, currentBoost - boostDrainPerSecond * Time.deltaTime);
        }
    }

    /// Begins using a timed healing item (bandage, first-aid kit, med kit). Cancels if interrupted externally.
    public void StartHealing(HealingItemDefinition item)
    {
        if (activeHealCoroutine != null) StopCoroutine(activeHealCoroutine);
        activeHealCoroutine = StartCoroutine(HealOverTime(item));
    }

    public void CancelHealing()
    {
        if (activeHealCoroutine != null)
        {
            StopCoroutine(activeHealCoroutine);
            activeHealCoroutine = null;
        }
    }

    private IEnumerator HealOverTime(HealingItemDefinition item)
    {
        yield return new WaitForSeconds(item.useSeconds);

        float cap = item.canOverhealToMax ? maxHealth : maxHealth * item.healCapFraction;
        if (currentHealth < cap)
        {
            Heal(item.healAmount, ignoreCap: false, hardCap: cap);
        }
        activeHealCoroutine = null;
    }

    private void Heal(float amount, bool ignoreCap, float? hardCap = null)
    {
        float cap = ignoreCap ? maxHealth : (hardCap ?? maxHealth);
        currentHealth = Mathf.Min(cap, currentHealth + amount);
        OnHealthChanged?.Invoke(currentHealth);
    }

    /// Consumes a boost item (energy drink, painkillers, adrenaline shot) adding to the boost meter.
    public void ApplyBoostItem(float boostAmount)
    {
        currentBoost = Mathf.Min(maxBoost, currentBoost + boostAmount);
    }

    /// Equips a new armor piece at the given tier, resetting durability to full for that tier.
    public void EquipArmor(ArmorTier tier)
    {
        equippedArmorTier = tier;
        armorDurability = tierMaxDurability[(int)tier];
    }

    /// Applies incoming damage, letting armor absorb a portion before it degrades and eventually breaks.
    public void TakeDamage(float rawDamage)
    {
        float damage = rawDamage;

        if (equippedArmorTier != ArmorTier.None && armorDurability > 0f)
        {
            float reduction = tierDamageReduction[(int)equippedArmorTier];
            float absorbed = Mathf.Min(armorDurability, rawDamage * reduction);
            armorDurability -= absorbed;
            damage -= absorbed;

            if (armorDurability <= 0f)
            {
                OnArmorBroken?.Invoke(equippedArmorTier);
                equippedArmorTier = ArmorTier.None;
            }
        }

        currentHealth = Mathf.Max(0f, currentHealth - damage);
        OnHealthChanged?.Invoke(currentHealth);

        if (currentHealth <= 0f)
        {
            OnDeath?.Invoke();
        }
    }

    public float HealthFraction => currentHealth / maxHealth;
    public float BoostFraction => currentBoost / maxBoost;
    public float ArmorFraction => equippedArmorTier == ArmorTier.None ? 0f : armorDurability / tierMaxDurability[(int)equippedArmorTier];
}
