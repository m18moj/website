/*
 * ScripForge — Loot Truck & Roaming Convoy
 * Pack: PUBG Pack | Category: Loot
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * A roaming high-tier loot truck that spawns an escort AI and drops its cargo when destroyed.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;

/// Drives a slow-moving convoy truck along a waypoint loop, spawns a small escort squad around it,
/// and scatters high-tier loot crates when the truck's health is depleted.
public class LootTruckRoamingConvoy : MonoBehaviour
{
    [Header("Route")]
    [SerializeField] private Transform[] waypoints;
    [SerializeField] private float moveSpeed = 6f;
    [SerializeField] private float waypointArriveDistance = 3f;
    [SerializeField] private float waypointPauseSeconds = 4f;

    [Header("Health")]
    [SerializeField] private float maxHealth = 400f;
    private float currentHealth;

    [Header("Escort")]
    [SerializeField] private GameObject escortPrefab;
    [SerializeField] private int escortCount = 3;
    [SerializeField] private float escortSpawnRadius = 8f;

    [Header("Cargo")]
    [SerializeField] private GameObject[] cargoCratePrefabs;
    [SerializeField] private int minCratesDropped = 3;
    [SerializeField] private int maxCratesDropped = 6;
    [SerializeField] private float cargoScatterRadius = 6f;

    public event Action OnConvoyStarted;
    public event Action<float> OnHealthChanged;
    public event Action OnTruckDestroyed;
    public event Action<List<GameObject>> OnCargoDropped;

    private readonly List<GameObject> escorts = new List<GameObject>();
    private int currentWaypointIndex;
    private bool isDestroyed;

    private void Start()
    {
        currentHealth = maxHealth;
        SpawnEscorts();
        OnConvoyStarted?.Invoke();
        if (waypoints != null && waypoints.Length > 0)
        {
            StartCoroutine(PatrolRoute());
        }
    }

    private IEnumerator PatrolRoute()
    {
        while (!isDestroyed)
        {
            Transform target = waypoints[currentWaypointIndex];

            while (!isDestroyed && Vector3.Distance(transform.position, target.position) > waypointArriveDistance)
            {
                Vector3 direction = (target.position - transform.position).normalized;
                transform.position += direction * moveSpeed * Time.deltaTime;
                transform.rotation = Quaternion.LookRotation(new Vector3(direction.x, 0f, direction.z));
                yield return null;
            }

            if (isDestroyed) yield break;

            yield return new WaitForSeconds(waypointPauseSeconds);
            currentWaypointIndex = (currentWaypointIndex + 1) % waypoints.Length;
        }
    }

    private void SpawnEscorts()
    {
        if (escortPrefab == null) return;

        for (int i = 0; i < escortCount; i++)
        {
            Vector2 offset = UnityEngine.Random.insideUnitCircle * escortSpawnRadius;
            Vector3 spawnPos = transform.position + new Vector3(offset.x, 0f, offset.y);
            GameObject escort = Instantiate(escortPrefab, spawnPos, Quaternion.identity);
            escorts.Add(escort);
        }
    }

    /// Applies incoming damage to the truck's hull; players must down the escort separately.
    public void TakeDamage(float amount)
    {
        if (isDestroyed) return;

        currentHealth = Mathf.Max(0f, currentHealth - amount);
        OnHealthChanged?.Invoke(currentHealth);

        if (currentHealth <= 0f)
        {
            DestroyTruck();
        }
    }

    private void DestroyTruck()
    {
        isDestroyed = true;
        StopAllCoroutines();

        foreach (GameObject escort in escorts)
        {
            if (escort != null) Destroy(escort);
        }
        escorts.Clear();

        List<GameObject> droppedCrates = ScatterCargo();
        OnCargoDropped?.Invoke(droppedCrates);
        OnTruckDestroyed?.Invoke();

        Destroy(gameObject, 3f);
    }

    private List<GameObject> ScatterCargo()
    {
        List<GameObject> dropped = new List<GameObject>();
        if (cargoCratePrefabs == null || cargoCratePrefabs.Length == 0) return dropped;

        int crateCount = UnityEngine.Random.Range(minCratesDropped, maxCratesDropped + 1);
        for (int i = 0; i < crateCount; i++)
        {
            GameObject prefab = cargoCratePrefabs[UnityEngine.Random.Range(0, cargoCratePrefabs.Length)];
            Vector2 offset = UnityEngine.Random.insideUnitCircle * cargoScatterRadius;
            Vector3 dropPos = transform.position + new Vector3(offset.x, 0f, offset.y);
            dropped.Add(Instantiate(prefab, dropPos, Quaternion.identity));
        }
        return dropped;
    }

    public float HealthFraction => maxHealth <= 0f ? 0f : currentHealth / maxHealth;
    public bool IsDestroyed => isDestroyed;
}
