/*
 * ScriptForge — Red Zone Bombing Event
 * Pack: PUBG Pack | Category: Events
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Random artillery-strike zone that telegraphs with a warning marker before raining area damage on a delay.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;

/// Spawns a telegraphed bombing run within the current playable area, then detonates a spread of explosions.
public class RedZoneBombingEvent : MonoBehaviour
{
    [Header("Trigger Timing")]
    [SerializeField] private float minSecondsBetweenEvents = 90f;
    [SerializeField] private float maxSecondsBetweenEvents = 180f;
    [SerializeField] private float telegraphDuration = 8f;

    [Header("Strike Area")]
    [SerializeField] private float zoneRadius = 40f;
    [SerializeField] private int impactCount = 12;
    [SerializeField] private float impactSpacingSeconds = 0.15f;
    [SerializeField] private float impactDamageRadius = 6f;
    [SerializeField] private float impactMaxDamage = 65f;
    [SerializeField] private LayerMask damageableMask = ~0;
    [SerializeField] private LayerMask groundMask = ~0;

    [Header("References")]
    [SerializeField] private GameObject warningMarkerPrefab;
    [SerializeField] private GameObject impactExplosionPrefab;
    [SerializeField] private Func<Vector3, float, Vector3> playAreaSampler; // Injected: returns a random point within the given center/radius.

    public event Action<Vector3, float> OnZoneTelegraphed; // center, radius
    public event Action<Vector3> OnImpact;
    public event Action OnEventComplete;

    private void OnEnable()
    {
        StartCoroutine(EventLoop());
    }

    private IEnumerator EventLoop()
    {
        while (true)
        {
            float waitTime = UnityEngine.Random.Range(minSecondsBetweenEvents, maxSecondsBetweenEvents);
            yield return new WaitForSeconds(waitTime);
            yield return RunBombingEvent();
        }
    }

    private IEnumerator RunBombingEvent()
    {
        Vector3 center = PickStrikeCenter();

        GameObject marker = warningMarkerPrefab != null ? Instantiate(warningMarkerPrefab, center, Quaternion.identity) : null;
        if (marker != null) marker.transform.localScale = new Vector3(zoneRadius * 2f, 1f, zoneRadius * 2f);

        OnZoneTelegraphed?.Invoke(center, zoneRadius);
        yield return new WaitForSeconds(telegraphDuration);

        if (marker != null) Destroy(marker);

        for (int i = 0; i < impactCount; i++)
        {
            Vector3 impactPoint = center + new Vector3(
                UnityEngine.Random.Range(-zoneRadius, zoneRadius),
                0f,
                UnityEngine.Random.Range(-zoneRadius, zoneRadius));

            // Clamp to a circular footprint rather than a square one.
            Vector2 offset = new Vector2(impactPoint.x - center.x, impactPoint.z - center.z);
            if (offset.magnitude > zoneRadius)
            {
                offset = offset.normalized * zoneRadius;
                impactPoint = new Vector3(center.x + offset.x, impactPoint.y, center.z + offset.y);
            }

            impactPoint = SnapToGround(impactPoint);
            DetonateImpact(impactPoint);

            yield return new WaitForSeconds(impactSpacingSeconds);
        }

        OnEventComplete?.Invoke();
    }

    private Vector3 PickStrikeCenter()
    {
        if (playAreaSampler != null) return playAreaSampler(transform.position, zoneRadius);
        Vector2 randomCircle = UnityEngine.Random.insideUnitCircle * zoneRadius * 2f;
        return transform.position + new Vector3(randomCircle.x, 0f, randomCircle.y);
    }

    private Vector3 SnapToGround(Vector3 point)
    {
        if (Physics.Raycast(point + Vector3.up * 200f, Vector3.down, out RaycastHit hit, 500f, groundMask))
        {
            return hit.point;
        }
        return point;
    }

    private void DetonateImpact(Vector3 point)
    {
        if (impactExplosionPrefab != null) Instantiate(impactExplosionPrefab, point, Quaternion.identity);
        OnImpact?.Invoke(point);

        Collider[] hits = Physics.OverlapSphere(point, impactDamageRadius, damageableMask);
        foreach (Collider hit in hits)
        {
            float falloff = 1f - Mathf.Clamp01(Vector3.Distance(point, hit.transform.position) / impactDamageRadius);
            // SendMessage keeps this file dependency-free; wire "ApplyDamage" up on your own damageable components.
            hit.SendMessage("ApplyDamage", impactMaxDamage * falloff, SendMessageOptions.DontRequireReceiver);
        }
    }
}
