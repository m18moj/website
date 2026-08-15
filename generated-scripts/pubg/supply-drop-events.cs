/*
 * ScripForge — Airdrop Flare & Loot Crate
 * Pack: PUBG Pack | Category: Events
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Flare-triggered supply plane routing, crate parachute physics, and high-tier loot rolled on open.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections;
using UnrealEngine;

public class SupplyDropEvents : MonoBehaviour
{
    [Header("Plane Routing")]
    [SerializeField] private Transform planeSpawnPointA;
    [SerializeField] private Transform planeSpawnPointB;
    [SerializeField] private float planeSpeed = 80f;
    [SerializeField] private float planeAltitude = 300f;

    [Header("Crate Prefab & Drop")]
    [SerializeField] private GameObject cratePrefab;
    [SerializeField] private GameObject planeVisualPrefab;
    [SerializeField] private float parachuteDeployAltitude = 150f;
    [SerializeField] private float freefallSpeed = 25f;
    [SerializeField] private float parachuteDescentSpeed = 4f;

    [Header("Loot")]
    [SerializeField] private LootSpawnManager lootSpawnManager;
    [SerializeField] private int crateItemCount = 3;

    public event Action<Vector3> OnFlareTriggered;
    public event Action<Vector3> OnCrateLanded;
    public event Action<GameObject> OnCrateOpened;

    /// Called when a player throws/uses a flare gun. Routes a supply plane over the target position.
    public void TriggerFlare(Vector3 targetGroundPosition)
    {
        OnFlareTriggered?.Invoke(targetGroundPosition);
        StartCoroutine(RunSupplyDrop(targetGroundPosition));
    }

    private IEnumerator RunSupplyDrop(Vector3 targetGroundPosition)
    {
        Vector3 flightStart = planeSpawnPointA != null ? planeSpawnPointA.position : targetGroundPosition + Vector3.left * 2000f;
        Vector3 flightEnd = planeSpawnPointB != null ? planeSpawnPointB.position : targetGroundPosition + Vector3.right * 2000f;
        flightStart.y = planeAltitude;
        flightEnd.y = planeAltitude;

        GameObject plane = planeVisualPrefab != null ? Instantiate(planeVisualPrefab, flightStart, Quaternion.identity) : null;

        float totalDistance = Vector3.Distance(flightStart, flightEnd);
        float dropFraction = Mathf.InverseLerp(0f, totalDistance,
            Vector3.Distance(flightStart, new Vector3(targetGroundPosition.x, planeAltitude, targetGroundPosition.z)));

        float elapsed = 0f;
        float totalFlightTime = totalDistance / planeSpeed;
        bool crateDropped = false;

        while (elapsed < totalFlightTime)
        {
            elapsed += Time.deltaTime;
            float t = elapsed / totalFlightTime;

            if (plane != null)
            {
                plane.transform.position = Vector3.Lerp(flightStart, flightEnd, t);
                plane.transform.LookAt(flightEnd);
            }

            if (!crateDropped && t >= dropFraction)
            {
                crateDropped = true;
                Vector3 dropOrigin = plane != null ? plane.transform.position : Vector3.Lerp(flightStart, flightEnd, dropFraction);
                StartCoroutine(DropCrate(dropOrigin, targetGroundPosition));
            }

            yield return null;
        }

        if (plane != null) Destroy(plane, 5f);
    }

    private IEnumerator DropCrate(Vector3 dropOrigin, Vector3 targetGroundPosition)
    {
        if (cratePrefab == null) yield break;

        GameObject crate = Instantiate(cratePrefab, dropOrigin, Quaternion.identity);
        Vector3 targetXZ = new Vector3(targetGroundPosition.x, dropOrigin.y, targetGroundPosition.z);
        crate.transform.position = targetXZ; // Assume wind-drift-free vertical drop for simplicity.

        bool parachuteOpen = false;

        while (crate != null && crate.transform.position.y > targetGroundPosition.y)
        {
            float speed = parachuteOpen ? parachuteDescentSpeed : freefallSpeed;
            crate.transform.position += Vector3.down * speed * Time.deltaTime;

            if (!parachuteOpen && crate.transform.position.y <= parachuteDeployAltitude)
            {
                parachuteOpen = true;
            }

            yield return null;
        }

        if (crate != null)
        {
            crate.transform.position = new Vector3(crate.transform.position.x, targetGroundPosition.y, crate.transform.position.z);
            OnCrateLanded?.Invoke(crate.transform.position);
        }
    }

    /// Called when a player interacts with a landed crate — rolls high-tier loot and marks it opened.
    public void OpenCrate(GameObject crate)
    {
        if (lootSpawnManager != null)
        {
            var loot = lootSpawnManager.RollAirdropLoot(crateItemCount);
            // A dedicated inventory/spawn system would place `loot` into the crate's world container here.
        }

        OnCrateOpened?.Invoke(crate);
    }
}
