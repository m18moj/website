/*
 * ScriptForge — Inventory Weight & Encumbrance
 * Pack: PUBG Pack | Category: Inventory
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Carry-weight limits with tiered movement-speed penalties and a hard overload threshold.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using System;
using System.Collections.Generic;
using UnityEngine;

[Serializable]
public class InventoryItemStack
{
    public string itemId;
    public float unitWeight;
    public int quantity;
    public float TotalWeight => unitWeight * quantity;
}

/// Tracks total carried weight against capacity thresholds and exposes the resulting movement penalty.
public class InventoryWeightEncumbrance : MonoBehaviour
{
    [Header("Capacity Thresholds")]
    [SerializeField] private float lightLoadCapacity = 40f;   // Below this: no penalty.
    [SerializeField] private float mediumLoadCapacity = 60f;  // Between light and medium: minor penalty.
    [SerializeField] private float maxCarryCapacity = 80f;    // Above this: cannot pick up more, heavy penalty applies below it.

    [Header("Speed Penalties")]
    [SerializeField] private float mediumLoadSpeedMultiplier = 0.9f;
    [SerializeField] private float heavyLoadSpeedMultiplier = 0.65f;

    [Header("Stamina")]
    [Tooltip("Extra stamina drain per second while over medium load, simulating fatigue from a heavy pack.")]
    [SerializeField] private float heavyLoadStaminaDrainPerSecond = 2f;

    private readonly List<InventoryItemStack> items = new List<InventoryItemStack>();

    public float CurrentWeight { get; private set; }
    public event Action<float> OnWeightChanged;
    public event Action OnOverloaded;

    /// Attempts to add weight to the inventory; returns false if it would exceed max carry capacity.
    public bool TryAddItem(string itemId, float unitWeight, int quantity)
    {
        float additionalWeight = unitWeight * quantity;
        if (CurrentWeight + additionalWeight > maxCarryCapacity)
        {
            OnOverloaded?.Invoke();
            return false;
        }

        InventoryItemStack existing = items.Find(i => i.itemId == itemId);
        if (existing != null)
        {
            existing.quantity += quantity;
        }
        else
        {
            items.Add(new InventoryItemStack { itemId = itemId, unitWeight = unitWeight, quantity = quantity });
        }

        RecalculateWeight();
        return true;
    }

    /// Removes up to quantity units of an item; returns the number actually removed.
    public int RemoveItem(string itemId, int quantity)
    {
        InventoryItemStack existing = items.Find(i => i.itemId == itemId);
        if (existing == null) return 0;

        int removed = Mathf.Min(existing.quantity, quantity);
        existing.quantity -= removed;
        if (existing.quantity <= 0) items.Remove(existing);

        RecalculateWeight();
        return removed;
    }

    private void RecalculateWeight()
    {
        float total = 0f;
        foreach (InventoryItemStack stack in items) total += stack.TotalWeight;
        CurrentWeight = total;
        OnWeightChanged?.Invoke(CurrentWeight);
    }

    private void Update()
    {
        if (CurrentLoadState == LoadState.Heavy && StaminaDrainHook != null)
        {
            StaminaDrainHook.Invoke(heavyLoadStaminaDrainPerSecond * Time.deltaTime);
        }
    }

    /// Optional external hook so this file doesn't need to know about your specific stamina component.
    public Action<float> StaminaDrainHook;

    public enum LoadState { Light, Medium, Heavy }

    public LoadState CurrentLoadState
    {
        get
        {
            if (CurrentWeight <= lightLoadCapacity) return LoadState.Light;
            if (CurrentWeight <= mediumLoadCapacity) return LoadState.Medium;
            return LoadState.Heavy;
        }
    }

    public float CurrentSpeedMultiplier => CurrentLoadState switch
    {
        LoadState.Medium => mediumLoadSpeedMultiplier,
        LoadState.Heavy => heavyLoadSpeedMultiplier,
        _ => 1f,
    };

    public float CapacityFraction01 => Mathf.Clamp01(CurrentWeight / maxCarryCapacity);
}
