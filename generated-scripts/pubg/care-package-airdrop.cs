/*
 * ScripForge — Care Package Airdrop
 * Pack: PUBG Pack | Category: Loot
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Flare-triggered supply-plane routing that flies over the map and parachutes a high-tier loot crate to a target point.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using System;
using System.Collections;
using UnityEngine;

/// Coordinates a supply plane flyover and crate drop after a player uses a flare gun at a target location.
public class CarePackageAirdrop : MonoBehaviour
{
    [Header("Plane Flight")]
    [SerializeField] private GameObject planePrefab;
    [SerializeField] private float planeSpeed = 45f;
    [SerializeField] private float planeAltitude = 120f;
    [SerializeField] private float approachDistance = 300f; // How far before the target the plane spawns.

    [Header("Crate Drop")]
    [SerializeField] private GameObject cratePrefab;
    [SerializeField] private float parachuteDescentSpeed = 4f;
    [SerializeField] private float parachuteDeployAltitude = 40f;
    [SerializeField] private float freeFallSpeed = 22f;

    [Header("Smoke Marker")]
    [SerializeField] private GameObject landingSmokePrefab;
    [SerializeField] private float smokeLifetime = 25f;

    public event Action<Vector3> OnPlaneDispatched;
    public event Action<Vector3> OnCrateLanded;

    /// Call this when a player fires a flare gun; targetPoint is the ground impact point.
    public void RequestAirdrop(Vector3 targetPoint)
    {
        StartCoroutine(RunAirdropSequence(targetPoint));
    }

    private IEnumerator RunAirdropSequence(Vector3 targetPoint)
    {
        Vector3 dropStart = new Vector3(targetPoint.x, planeAltitude, targetPoint.z);
        Vector2 randomHeading = UnityEngine.Random.insideUnitCircle.normalized;
        Vector3 flightDirection = new Vector3(randomHeading.x, 0f, randomHeading.y);

        Vector3 spawnPoint = dropStart - flightDirection * approachDistance;
        Vector3 exitPoint = dropStart + flightDirection * approachDistance;

        GameObject plane = planePrefab != null
            ? Instantiate(planePrefab, spawnPoint, Quaternion.LookRotation(flightDirection))
            : null;

        OnPlaneDispatched?.Invoke(targetPoint);

        // Fly the plane from spawn to the drop point, releasing the crate exactly overhead.
        bool crateReleased = false;
        while (plane != null && Vector3.Distance(plane.transform.position, exitPoint) > 1f)
        {
            plane.transform.position = Vector3.MoveTowards(plane.transform.position, exitPoint, planeSpeed * Time.deltaTime);

            if (!crateReleased && Vector3.Distance(new Vector3(plane.transform.position.x, 0f, plane.transform.position.z),
                    new Vector3(dropStart.x, 0f, dropStart.z)) < 2f)
            {
                crateReleased = true;
                StartCoroutine(DropCrate(dropStart, targetPoint));
            }

            yield return null;
        }

        if (plane != null) Destroy(plane, 5f);
    }

    private IEnumerator DropCrate(Vector3 startPosition, Vector3 targetPoint)
    {
        GameObject crate = cratePrefab != null
            ? Instantiate(cratePrefab, startPosition, Quaternion.identity)
            : new GameObject("CratePlaceholder");

        Vector3 groundPoint = new Vector3(targetPoint.x, GetGroundHeight(targetPoint), targetPoint.z);
        bool parachuteOpen = false;

        while (crate.transform.position.y > groundPoint.y)
        {
            float speed = parachuteOpen ? parachuteDescentSpeed : freeFallSpeed;
            crate.transform.position += Vector3.down * (speed * Time.deltaTime);

            if (!parachuteOpen && crate.transform.position.y <= parachuteDeployAltitude)
            {
                parachuteOpen = true; // In a full implementation this would toggle a parachute mesh/animator.
            }

            yield return null;
        }

        crate.transform.position = groundPoint;

        if (landingSmokePrefab != null)
        {
            GameObject smoke = Instantiate(landingSmokePrefab, groundPoint, Quaternion.identity);
            Destroy(smoke, smokeLifetime);
        }

        OnCrateLanded?.Invoke(groundPoint);
    }

    /// Placeholder ground sampler; replace with a raycast against your terrain/collision layer.
    private float GetGroundHeight(Vector3 point)
    {
        if (Physics.Raycast(point + Vector3.up * 500f, Vector3.down, out RaycastHit hit, 1000f))
        {
            return hit.point.y;
        }
        return 0f;
    }
}
