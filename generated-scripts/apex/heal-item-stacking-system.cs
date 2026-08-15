/*
 * ScripForge — Heal & Shield Cell Stacking
 * Pack: Apex Legends Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Stackable heal/shield consumables with use-time interrupts and inventory stack-cap rules.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections.Generic;
using UnrealEngine;

public enum ConsumableType { SyringeHeal, MedKitHeal, ShieldCell, ShieldBattery }

[Serializable]
public struct ConsumableDefinition
{
    public ConsumableType type;
    public int stackCap;
    public float useSeconds;
    public float restoreAmount;
    public bool restoresHealth; // false = restores shield instead
    public bool fullyRestoresPool; // med kit / shield battery style full restore
}

/// A single stack of one consumable type in the player's inventory.
public class ConsumableStack
{
    public ConsumableType type;
    public int count;
}

/// Manages stackable heal/shield inventory items: pickup stacking with caps, timed use with
/// movement/damage interrupts, and health/shield pool restoration on successful completion.
public class HealItemStackingSystem : MonoBehaviour
{
    [Header("Consumable Table")]
    [SerializeField] private List<ConsumableDefinition> consumableTable = new List<ConsumableDefinition>
    {
        new ConsumableDefinition { type = ConsumableType.SyringeHeal,  stackCap = 6, useSeconds = 3f, restoreAmount = 25f,  restoresHealth = true,  fullyRestoresPool = false },
        new ConsumableDefinition { type = ConsumableType.MedKitHeal,   stackCap = 2, useSeconds = 8f, restoreAmount = 100f, restoresHealth = true,  fullyRestoresPool = true  },
        new ConsumableDefinition { type = ConsumableType.ShieldCell,   stackCap = 6, useSeconds = 3f, restoreAmount = 25f,  restoresHealth = false, fullyRestoresPool = false },
        new ConsumableDefinition { type = ConsumableType.ShieldBattery,stackCap = 2, useSeconds = 5f, restoreAmount = 100f, restoresHealth = false, fullyRestoresPool = true  },
    };

    private readonly Dictionary<ConsumableType, ConsumableStack> inventory = new Dictionary<ConsumableType, ConsumableStack>();

    public bool IsUsingItem { get; private set; }
    public ConsumableType? ActiveUseType { get; private set; }
    public float UseProgressSeconds { get; private set; }

    public event Action<ConsumableType, int> OnStackChanged; // type, newCount
    public event Action<ConsumableType> OnUseStarted;
    public event Action<ConsumableType> OnUseInterrupted;
    public event Action<ConsumableType, float, bool> OnUseCompleted; // type, restoreAmount, restoresHealth

    private void Update()
    {
        if (!IsUsingItem) return;

        UseProgressSeconds += Time.deltaTime;
        var def = FindDefinition(ActiveUseType.Value);

        if (UseProgressSeconds >= def.useSeconds)
        {
            CompleteUse(def);
        }
    }

    /// Adds picked-up consumables to inventory, respecting the per-type stack cap. Returns overflow count
    /// that could not be picked up (left on the ground) so callers can spawn a partial pickup.
    public int AddToStack(ConsumableType type, int amount)
    {
        var def = FindDefinition(type);
        if (!inventory.TryGetValue(type, out var stack))
        {
            stack = new ConsumableStack { type = type, count = 0 };
            inventory[type] = stack;
        }

        int roomLeft = def.stackCap - stack.count;
        int accepted = Mathf.Max(0, Mathf.Min(amount, roomLeft));
        stack.count += accepted;

        OnStackChanged?.Invoke(type, stack.count);
        return amount - accepted;
    }

    public int GetStackCount(ConsumableType type)
    {
        return inventory.TryGetValue(type, out var stack) ? stack.count : 0;
    }

    /// Begins the timed-use action for a consumable, e.g. holding the heal button.
    public bool BeginUse(ConsumableType type)
    {
        if (IsUsingItem) return false;
        if (GetStackCount(type) <= 0) return false;

        IsUsingItem = true;
        ActiveUseType = type;
        UseProgressSeconds = 0f;
        OnUseStarted?.Invoke(type);
        return true;
    }

    /// Called by the movement/combat systems when the player takes damage or sprints during a use action.
    public void InterruptUse()
    {
        if (!IsUsingItem) return;

        var interruptedType = ActiveUseType.Value;
        IsUsingItem = false;
        ActiveUseType = null;
        UseProgressSeconds = 0f;
        OnUseInterrupted?.Invoke(interruptedType);
    }

    private void CompleteUse(ConsumableDefinition def)
    {
        IsUsingItem = false;
        ActiveUseType = null;
        UseProgressSeconds = 0f;

        ConsumeOne(def.type);
        OnUseCompleted?.Invoke(def.type, def.restoreAmount, def.restoresHealth);
    }

    private void ConsumeOne(ConsumableType type)
    {
        if (!inventory.TryGetValue(type, out var stack) || stack.count <= 0) return;

        stack.count -= 1;
        OnStackChanged?.Invoke(type, stack.count);
    }

    /// Combines two partial stacks of the same type into one, capped at stackCap — used when picking up
    /// loose stacks that would otherwise sit in separate slots.
    public void CondenseStacks(ConsumableType type)
    {
        var def = FindDefinition(type);
        if (!inventory.TryGetValue(type, out var stack)) return;

        stack.count = Mathf.Min(def.stackCap, stack.count);
        OnStackChanged?.Invoke(type, stack.count);
    }

    public int GetStackCap(ConsumableType type) => FindDefinition(type).stackCap;

    private ConsumableDefinition FindDefinition(ConsumableType type)
    {
        foreach (var def in consumableTable)
        {
            if (def.type == type) return def;
        }
        return consumableTable[0];
    }
}
