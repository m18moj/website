/*
 * ScripForge — Legend Ability Framework
 * Pack: Apex Legends Pack | Category: Abilities
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * A tactical/passive/ultimate ability data structure with charge rate, cooldown reduction, and interrupt rules.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections.Generic;
using UnrealEngine;

public enum AbilitySlot { Passive, Tactical, Ultimate }

[Serializable]
public class AbilityDefinition
{
    public string abilityName;
    public AbilitySlot slot;
    public float cooldownSeconds = 20f;
    public float chargeRatePerSecond = 1f;   // For charge-based ultimates.
    public float maxCharge = 100f;
    public bool interruptibleByStun = true;
    public bool interruptibleByKnockdown = true;
}

/// Runtime state for a single equipped ability instance.
public class AbilityRuntime
{
    public AbilityDefinition definition;
    public float currentCharge;
    public float cooldownRemaining;
    public bool isCasting;

    public bool IsReady => definition.slot == AbilitySlot.Ultimate
        ? currentCharge >= definition.maxCharge
        : cooldownRemaining <= 0f;
}

public class LegendAbilityFramework : MonoBehaviour
{
    [SerializeField] private List<AbilityDefinition> equippedAbilities = new List<AbilityDefinition>();

    [Header("Cooldown Reduction")]
    [Tooltip("0 = no reduction, 0.25 = 25% faster cooldowns from perks/items.")]
    [SerializeField] private float cooldownReductionFraction = 0f;

    public event Action<AbilitySlot> OnAbilityCast;
    public event Action<AbilitySlot> OnAbilityReady;
    public event Action<AbilitySlot> OnAbilityInterrupted;

    private readonly Dictionary<AbilitySlot, AbilityRuntime> runtimeStates = new Dictionary<AbilitySlot, AbilityRuntime>();

    private void Awake()
    {
        foreach (var def in equippedAbilities)
        {
            runtimeStates[def.slot] = new AbilityRuntime { definition = def };
        }
    }

    private void Update()
    {
        foreach (var kvp in runtimeStates)
        {
            var runtime = kvp.Value;
            bool wasReady = runtime.IsReady;

            if (runtime.definition.slot == AbilitySlot.Ultimate)
            {
                if (runtime.currentCharge < runtime.definition.maxCharge)
                {
                    runtime.currentCharge = Mathf.Min(runtime.definition.maxCharge,
                        runtime.currentCharge + runtime.definition.chargeRatePerSecond * Time.deltaTime);
                }
            }
            else if (runtime.cooldownRemaining > 0f)
            {
                float rate = 1f + cooldownReductionFraction;
                runtime.cooldownRemaining = Mathf.Max(0f, runtime.cooldownRemaining - Time.deltaTime * rate);
            }

            if (!wasReady && runtime.IsReady)
            {
                OnAbilityReady?.Invoke(kvp.Key);
            }
        }
    }

    /// Attempts to cast the ability in the given slot. Returns true if the cast started.
    public bool TryCast(AbilitySlot slot)
    {
        if (!runtimeStates.TryGetValue(slot, out var runtime) || !runtime.IsReady)
        {
            return false;
        }

        runtime.isCasting = true;
        OnAbilityCast?.Invoke(slot);

        if (slot == AbilitySlot.Ultimate)
        {
            runtime.currentCharge = 0f;
        }
        else
        {
            runtime.cooldownRemaining = runtime.definition.cooldownSeconds;
        }

        return true;
    }

    /// Called by combat/status systems when the caster is stunned or knocked down mid-cast.
    public void TryInterrupt(AbilitySlot slot, bool isStun)
    {
        if (!runtimeStates.TryGetValue(slot, out var runtime) || !runtime.isCasting) return;

        bool canInterrupt = isStun ? runtime.definition.interruptibleByStun : runtime.definition.interruptibleByKnockdown;
        if (canInterrupt)
        {
            runtime.isCasting = false;
            OnAbilityInterrupted?.Invoke(slot);
        }
    }

    /// Grants bonus ultimate charge, e.g. from tactical-hit passives or care package bonuses.
    public void AddUltimateCharge(float amount)
    {
        if (runtimeStates.TryGetValue(AbilitySlot.Ultimate, out var runtime))
        {
            runtime.currentCharge = Mathf.Min(runtime.definition.maxCharge, runtime.currentCharge + amount);
        }
    }

    public float GetCooldownFraction(AbilitySlot slot)
    {
        if (!runtimeStates.TryGetValue(slot, out var runtime)) return 0f;
        return slot == AbilitySlot.Ultimate
            ? runtime.currentCharge / runtime.definition.maxCharge
            : 1f - (runtime.cooldownRemaining / runtime.definition.cooldownSeconds);
    }
}
