/*
 * ScripForge — Ordnance Cook & Throw Arc
 * Pack: Apex Legends Pack | Category: Combat
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Grenade cook timers, a trajectory arc preview, and bounce/detonation physics for thrown ordnance.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections.Generic;
using UnrealEngine;

public enum OrdnanceType { FragGrenade, ArcStar, ThermiteGrenade }

[Serializable]
public struct OrdnanceDefinition
{
    public OrdnanceType type;
    public float fuseSeconds;
    public bool cookable;
    public float throwSpeed;
    public float bounciness; // 0 = no bounce, 1 = near-perfect bounce
    public int maxBounces;
}

/// Handles the cook-and-throw lifecycle for a single piece of ordnance: hold-to-cook timing,
/// a sampled trajectory arc for the preview line, and bounce/detonation resolution after release.
public class OrdnanceCookThrowArc : MonoBehaviour
{
    [Header("Ordnance Table")]
    [SerializeField] private List<OrdnanceDefinition> ordnanceTable = new List<OrdnanceDefinition>
    {
        new OrdnanceDefinition { type = OrdnanceType.FragGrenade,     fuseSeconds = 3.5f, cookable = true,  throwSpeed = 22f, bounciness = 0.35f, maxBounces = 2 },
        new OrdnanceDefinition { type = OrdnanceType.ArcStar,          fuseSeconds = 2.0f, cookable = false, throwSpeed = 26f, bounciness = 0.1f,  maxBounces = 1 },
        new OrdnanceDefinition { type = OrdnanceType.ThermiteGrenade,  fuseSeconds = 2.5f, cookable = true,  throwSpeed = 20f, bounciness = 0.2f,  maxBounces = 1 },
    };

    [Header("Arc Preview")]
    [SerializeField] private int arcSampleCount = 24;
    [SerializeField] private float arcSampleStepSeconds = 0.08f;
    [SerializeField] private float gravity = 9.8f;

    [Header("Cook Safety")]
    [Tooltip("Cooking within this margin of self-detonation forces an early release to avoid instant self-kills.")]
    [SerializeField] private float minSafeReleaseMargin = 0.15f;

    public bool IsCooking { get; private set; }
    public float CookElapsedSeconds { get; private set; }
    public OrdnanceType? ActiveOrdnanceType { get; private set; }

    public event Action<OrdnanceType> OnCookStarted;
    public event Action<OrdnanceType, float> OnThrown; // type, remainingFuseAtRelease
    public event Action<OrdnanceType> OnSelfDetonated;
    public event Action<Vector3, OrdnanceType> OnDetonated; // position, type

    private void Update()
    {
        if (!IsCooking) return;

        CookElapsedSeconds += Time.deltaTime;
        var def = FindDefinition(ActiveOrdnanceType.Value);

        if (CookElapsedSeconds >= def.fuseSeconds)
        {
            IsCooking = false;
            OnSelfDetonated?.Invoke(ActiveOrdnanceType.Value);
            ActiveOrdnanceType = null;
        }
    }

    /// Starts cooking a cookable ordnance type in the player's hand (holding the throw button).
    public bool StartCook(OrdnanceType type)
    {
        var def = FindDefinition(type);
        if (!def.cookable || IsCooking) return false;

        IsCooking = true;
        CookElapsedSeconds = 0f;
        ActiveOrdnanceType = type;
        OnCookStarted?.Invoke(type);
        return true;
    }

    /// Releases the throw (either a cooked grenade or an uncooked instant throw for non-cookable ordnance).
    public float ReleaseThrow(OrdnanceType type, Vector3 originPosition, Vector3 throwDirection)
    {
        var def = FindDefinition(type);
        float remainingFuse = def.fuseSeconds;

        if (IsCooking && ActiveOrdnanceType == type)
        {
            remainingFuse = Mathf.Max(minSafeReleaseMargin, def.fuseSeconds - CookElapsedSeconds);
            IsCooking = false;
            ActiveOrdnanceType = null;
        }

        OnThrown?.Invoke(type, remainingFuse);
        SimulateFlight(originPosition, throwDirection.normalized * def.throwSpeed, def, remainingFuse);
        return remainingFuse;
    }

    /// Builds a sampled trajectory arc for the UI preview line, ignoring bounces (straight ballistic path).
    public List<Vector3> SampleTrajectoryArc(Vector3 originPosition, Vector3 throwDirection, OrdnanceType type)
    {
        var def = FindDefinition(type);
        Vector3 velocity = throwDirection.normalized * def.throwSpeed;
        var points = new List<Vector3>(arcSampleCount);

        for (int i = 0; i < arcSampleCount; i++)
        {
            float t = i * arcSampleStepSeconds;
            Vector3 offset = velocity * t;
            offset.y += -0.5f * gravity * t * t;
            points.Add(originPosition + offset);
        }

        return points;
    }

    /// Simplified flight + bounce simulation that fires OnDetonated once the fuse expires or bounces run out.
    private void SimulateFlight(Vector3 originPosition, Vector3 initialVelocity, OrdnanceDefinition def, float fuseSeconds)
    {
        Vector3 currentPosition = originPosition;
        Vector3 currentVelocity = initialVelocity;
        int bouncesUsed = 0;
        float timeRemaining = fuseSeconds;
        float step = 0.05f;

        while (timeRemaining > 0f)
        {
            currentVelocity.y -= gravity * step;
            currentPosition += currentVelocity * step;
            timeRemaining -= step;

            bool hitGround = currentPosition.y <= 0f;
            if (hitGround)
            {
                currentPosition.y = 0f;

                if (bouncesUsed < def.maxBounces && def.bounciness > 0f)
                {
                    currentVelocity.y = Mathf.Abs(currentVelocity.y) * def.bounciness;
                    currentVelocity.x *= def.bounciness;
                    currentVelocity.z *= def.bounciness;
                    bouncesUsed++;
                }
                else
                {
                    break;
                }
            }
        }

        OnDetonated?.Invoke(currentPosition, def.type);
    }

    public bool CancelCook()
    {
        if (!IsCooking) return false;
        IsCooking = false;
        ActiveOrdnanceType = null;
        CookElapsedSeconds = 0f;
        return true;
    }

    private OrdnanceDefinition FindDefinition(OrdnanceType type)
    {
        foreach (var def in ordnanceTable)
        {
            if (def.type == type) return def;
        }
        return ordnanceTable[0];
    }
}
