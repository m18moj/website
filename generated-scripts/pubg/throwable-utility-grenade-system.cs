/*
 * ScripForge — Throwable & Utility Grenade System
 * Pack: PUBG Pack | Category: Equipment
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Frag, smoke, and stun throwable physics with cook timers, arc-based throw force, and area effect callbacks.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;

public enum ThrowableType { Frag, Smoke, Stun }

[Serializable]
public class ThrowableDefinition
{
    public ThrowableType type = ThrowableType.Frag;
    public GameObject projectilePrefab;
    public float fuseSeconds = 4f;
    public float maxCookSeconds = 3.5f; // Cooking beyond this auto-detonates in-hand as a safety fallback.
    public float throwForce = 18f;
    public float effectRadius = 6f;
    public float maxDamage = 100f;
    public float stunSeconds = 4f; // Only relevant for Stun type.
}

/// Handles cooking, throwing, and detonating utility throwables from a player's hand anchor.
public class ThrowableUtilityGrenadeSystem : MonoBehaviour
{
    [Header("References")]
    [SerializeField] private Transform throwOrigin;
    [SerializeField] private LayerMask damageableMask = ~0;

    [Header("Active Cook State")]
    [SerializeField] private ThrowableDefinition equipped;
    private float cookElapsed;
    private bool isCooking;

    public event Action<ThrowableType> OnThrown;
    public event Action<ThrowableType, float> OnCookProgress; // type, normalized 0-1

    /// Begins cooking the fuse while the throw button is held. Call every frame while held.
    public void BeginCook(ThrowableDefinition definition)
    {
        equipped = definition;
        if (!isCooking)
        {
            isCooking = true;
            cookElapsed = 0f;
            StartCoroutine(CookRoutine());
        }
    }

    private IEnumerator CookRoutine()
    {
        while (isCooking && cookElapsed < equipped.maxCookSeconds)
        {
            cookElapsed += Time.deltaTime;
            OnCookProgress?.Invoke(equipped.type, cookElapsed / equipped.maxCookSeconds);
            yield return null;
        }

        // Held too long past the safety window — detonates in hand.
        if (isCooking)
        {
            Detonate(throwOrigin.position, equipped);
            isCooking = false;
        }
    }

    /// Releases the throw with an arc trajectory. Remaining fuse time is whatever the fuse minus cook time leaves.
    public void ReleaseThrow(Vector3 aimDirection)
    {
        if (!isCooking || equipped == null) return;
        isCooking = false;

        float remainingFuse = Mathf.Max(0.05f, equipped.fuseSeconds - cookElapsed);
        GameObject projectile = Instantiate(equipped.projectilePrefab, throwOrigin.position, Quaternion.LookRotation(aimDirection));

        Rigidbody rb = projectile.GetComponent<Rigidbody>();
        if (rb != null)
        {
            rb.AddForce(aimDirection.normalized * equipped.throwForce + Vector3.up * (equipped.throwForce * 0.35f), ForceMode.VelocityChange);
        }

        OnThrown?.Invoke(equipped.type);
        StartCoroutine(FuseRoutine(projectile, equipped, remainingFuse));
    }

    private IEnumerator FuseRoutine(GameObject projectile, ThrowableDefinition definition, float fuse)
    {
        yield return new WaitForSeconds(fuse);
        Vector3 pos = projectile != null ? projectile.transform.position : throwOrigin.position;
        if (projectile != null) Destroy(projectile);
        Detonate(pos, definition);
    }

    /// Applies the throwable's area effect at the given world position based on its type.
    private void Detonate(Vector3 position, ThrowableDefinition definition)
    {
        Collider[] hits = Physics.OverlapSphere(position, definition.effectRadius, damageableMask);
        foreach (Collider hit in hits)
        {
            float distanceFactor = 1f - Vector3.Distance(position, hit.transform.position) / definition.effectRadius;
            distanceFactor = Mathf.Clamp01(distanceFactor);

            switch (definition.type)
            {
                case ThrowableType.Frag:
                    IDamageable damageable = hit.GetComponent<IDamageable>();
                    damageable?.ApplyDamage(definition.maxDamage * distanceFactor, position);
                    break;
                case ThrowableType.Smoke:
                    hit.SendMessage("OnEnterSmoke", SendMessageOptions.DontRequireReceiver);
                    break;
                case ThrowableType.Stun:
                    hit.SendMessage("ApplyStun", definition.stunSeconds * distanceFactor, SendMessageOptions.DontRequireReceiver);
                    break;
            }
        }
    }
}

/// Minimal damage contract so this file compiles standalone; wire to your own health system.
public interface IDamageable
{
    void ApplyDamage(float amount, Vector3 fromPosition);
}
