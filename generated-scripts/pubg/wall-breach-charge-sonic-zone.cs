/*
 * ScripForge — Wall Breach Charge & Sonic Zone
 * Pack: PUBG Pack | Category: World
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Destructible-wall breach charges paired with a sonic-bombardment variant of the standard blue zone.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using System;
using System.Collections;
using UnityEngine;

/// Handles two related late-game hazards: player-placed breach charges that punch through destructible
/// walls, and an alternate "sonic zone" collapse mode that pulses disorienting AoE damage instead of
/// the usual flat gas-tick damage over time.
public class WallBreachChargeSonicZone : MonoBehaviour
{
    [Header("Breach Charge")]
    [SerializeField] private GameObject chargePrefab;
    [SerializeField] private float armSeconds = 3f;
    [SerializeField] private float detonateDelaySeconds = 2f;
    [SerializeField] private float breachRadius = 3.5f;
    [SerializeField] private LayerMask destructibleWallMask;

    [Header("Sonic Zone")]
    [SerializeField] private bool sonicZoneEnabled = true;
    [SerializeField] private float sonicPulseInterval = 6f;
    [SerializeField] private float sonicPulseDamage = 8f;
    [SerializeField] private float sonicDisorientSeconds = 2.5f;
    [SerializeField] private LayerMask playerMask;

    public event Action<Vector3> OnChargeArmed;
    public event Action<Vector3> OnWallBreached;
    public event Action<Vector3, int> OnSonicPulse; // origin, players affected

    private Coroutine sonicRoutine;
    private bool sonicZoneActive;

    /// Places and arms a breach charge against a destructible wall at the given contact point.
    public void PlaceCharge(Vector3 wallContactPoint, Vector3 wallNormal)
    {
        StartCoroutine(ArmAndDetonate(wallContactPoint, wallNormal));
    }

    private IEnumerator ArmAndDetonate(Vector3 wallContactPoint, Vector3 wallNormal)
    {
        GameObject chargeInstance = chargePrefab != null
            ? Instantiate(chargePrefab, wallContactPoint, Quaternion.LookRotation(wallNormal))
            : new GameObject("BreachChargePlaceholder");

        yield return new WaitForSeconds(armSeconds);
        OnChargeArmed?.Invoke(wallContactPoint);

        yield return new WaitForSeconds(detonateDelaySeconds);
        Detonate(wallContactPoint, wallNormal);

        if (chargeInstance != null) Destroy(chargeInstance);
    }

    private void Detonate(Vector3 point, Vector3 normal)
    {
        Collider[] wallHits = Physics.OverlapSphere(point, breachRadius, destructibleWallMask);
        foreach (Collider wall in wallHits)
        {
            // Destructible-wall hook: swap this for your terrain/mesh-destruction call.
            IBreachable breachable = wall.GetComponent<IBreachable>();
            breachable?.Breach(point, breachRadius);
        }

        OnWallBreached?.Invoke(point);
    }

    /// Switches the zone collapse behavior from standard DoT to periodic sonic AoE pulses centered
    /// on the given zone center. Intended to be called by the match's zone-phase controller.
    public void ActivateSonicZone(Vector3 zoneCenter, float zoneRadius)
    {
        if (!sonicZoneEnabled || sonicZoneActive) return;

        sonicZoneActive = true;
        sonicRoutine = StartCoroutine(SonicBombardmentLoop(zoneCenter, zoneRadius));
    }

    public void DeactivateSonicZone()
    {
        sonicZoneActive = false;
        if (sonicRoutine != null)
        {
            StopCoroutine(sonicRoutine);
            sonicRoutine = null;
        }
    }

    private IEnumerator SonicBombardmentLoop(Vector3 zoneCenter, float zoneRadius)
    {
        while (sonicZoneActive)
        {
            yield return new WaitForSeconds(sonicPulseInterval);

            Vector3 pulseOrigin = zoneCenter + (Vector3)(UnityEngine.Random.insideUnitCircle * zoneRadius * 0.5f);
            pulseOrigin.y = zoneCenter.y;

            Collider[] hits = Physics.OverlapSphere(pulseOrigin, zoneRadius * 0.25f, playerMask);
            foreach (Collider hit in hits)
            {
                IDamageable damageable = hit.GetComponent<IDamageable>();
                damageable?.ApplyDamage(sonicPulseDamage, pulseOrigin);
                hit.SendMessage("ApplyDisorient", sonicDisorientSeconds, SendMessageOptions.DontRequireReceiver);
            }

            OnSonicPulse?.Invoke(pulseOrigin, hits.Length);
        }
    }

    public bool SonicZoneActive => sonicZoneActive;
}

/// Minimal contract for destructible wall pieces so this file compiles standalone.
public interface IBreachable
{
    void Breach(Vector3 point, float radius);
}

/// Minimal damage contract so this file compiles standalone; wire to your own health system.
public interface IDamageable
{
    void ApplyDamage(float amount, Vector3 fromPosition);
}
