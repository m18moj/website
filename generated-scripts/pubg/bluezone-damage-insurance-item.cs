/*
 * ScripForge — Bluezone Damage Insurance Item
 * Pack: PUBG Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * A consumable that halves the next zone-tick damage instance it absorbs, gated by a use cooldown.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using System;
using System.Collections;
using UnityEngine;

/// Inventory consumable that, once activated, intercepts and reduces exactly one incoming blue-zone
/// damage tick before falling back into cooldown. Intended to be queried by a zone-damage component
/// each time it is about to apply a tick to this player.
public class BluezoneDamageInsuranceItem : MonoBehaviour
{
    [Header("Item Definition")]
    [SerializeField] private string itemName = "Zone Insurance Flask";
    [SerializeField] private int maxCharges = 2;
    [Range(0f, 1f)]
    [SerializeField] private float damageReductionFraction = 0.5f;

    [Header("Cooldown")]
    [SerializeField] private float useCooldownSeconds = 45f;

    [Header("Activation Window")]
    [Tooltip("Once armed, the reduction only applies to the first zone tick received within this window.")]
    [SerializeField] private float armedWindowSeconds = 12f;

    public int ChargesRemaining { get; private set; }
    public bool IsArmed { get; private set; }
    public bool IsOnCooldown { get; private set; }
    public float CooldownRemaining { get; private set; }

    public event Action OnActivated;
    public event Action<float, float> OnDamageAbsorbed; // rawDamage, reducedDamage
    public event Action OnArmedWindowExpired;
    public event Action OnCooldownFinished;

    private Coroutine armedRoutine;
    private Coroutine cooldownRoutine;

    private void Awake()
    {
        ChargesRemaining = maxCharges;
    }

    /// Consumes a charge and arms the insurance effect. Returns false if empty, already armed, or on cooldown.
    public bool TryActivate()
    {
        if (ChargesRemaining <= 0 || IsArmed || IsOnCooldown) return false;

        ChargesRemaining--;
        IsArmed = true;
        OnActivated?.Invoke();

        if (armedRoutine != null) StopCoroutine(armedRoutine);
        armedRoutine = StartCoroutine(ArmedWindowRoutine());
        return true;
    }

    private IEnumerator ArmedWindowRoutine()
    {
        yield return new WaitForSeconds(armedWindowSeconds);

        if (IsArmed)
        {
            IsArmed = false;
            OnArmedWindowExpired?.Invoke();
            BeginCooldown();
        }
    }

    /// The zone-damage system should route each incoming tick through here before applying it.
    /// Returns the (possibly reduced) damage value to actually apply.
    public float FilterZoneDamage(float rawTickDamage)
    {
        if (!IsArmed) return rawTickDamage;

        IsArmed = false;
        if (armedRoutine != null)
        {
            StopCoroutine(armedRoutine);
            armedRoutine = null;
        }

        float reduced = rawTickDamage * (1f - damageReductionFraction);
        OnDamageAbsorbed?.Invoke(rawTickDamage, reduced);
        BeginCooldown();
        return reduced;
    }

    private void BeginCooldown()
    {
        IsOnCooldown = true;
        CooldownRemaining = useCooldownSeconds;

        if (cooldownRoutine != null) StopCoroutine(cooldownRoutine);
        cooldownRoutine = StartCoroutine(CooldownTimer());
    }

    private IEnumerator CooldownTimer()
    {
        while (CooldownRemaining > 0f)
        {
            CooldownRemaining -= Time.deltaTime;
            yield return null;
        }

        CooldownRemaining = 0f;
        IsOnCooldown = false;
        OnCooldownFinished?.Invoke();
    }

    /// Restocks charges, e.g. when the item is picked up again from the ground.
    public void AddCharge(int amount = 1)
    {
        ChargesRemaining = Mathf.Min(maxCharges, ChargesRemaining + amount);
    }

    public string ItemName => itemName;
    public float CooldownFraction01 => useCooldownSeconds <= 0f ? 1f : 1f - (CooldownRemaining / useCooldownSeconds);
}
