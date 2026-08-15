/*
 * ScripForge — Emergency Pickup Helicopter Extraction
 * Pack: PUBG Pack | Category: Events
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * A late-match helicopter extraction zone with a limited-seat evac window and bonus survival score.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;

public enum ExtractionState { Inactive, Telegraphed, Boarding, Departing, Complete }

/// Spawns a late-game helicopter extraction opportunity: a marked landing zone with a short boarding
/// window, a fixed seat count, and a score bonus for everyone who makes it out alive.
public class EmergencyPickupHelicopterExtraction : MonoBehaviour
{
    [Header("Activation")]
    [Tooltip("Fraction of the match timer (0-1) after which this event is allowed to trigger.")]
    [SerializeField] private float earliestActivationFraction = 0.75f;
    [SerializeField] private int minPlayersAliveToTrigger = 8;

    [Header("Zone")]
    [SerializeField] private Transform helicopterSpawnPoint;
    [SerializeField] private GameObject helicopterPrefab;
    [SerializeField] private GameObject beaconMarkerPrefab;
    [SerializeField] private float boardingRadius = 12f;
    [SerializeField] private float telegraphSeconds = 20f;

    [Header("Boarding Window")]
    [SerializeField] private int seatCount = 4;
    [SerializeField] private float boardingWindowSeconds = 40f;
    [SerializeField] private float departureFlightSeconds = 15f;

    [Header("Rewards")]
    [SerializeField] private int survivalBonusScore = 250;

    public ExtractionState State { get; private set; } = ExtractionState.Inactive;
    public int SeatsRemaining { get; private set; }

    public event Action<Vector3> OnZoneTelegraphed;
    public event Action OnBoardingOpened;
    public event Action<Transform> OnPlayerBoarded;
    public event Action OnHelicopterDeparted;
    public event Action OnWindowExpired;

    private readonly List<Transform> boardedPlayers = new List<Transform>();
    private GameObject helicopterInstance;
    private GameObject beaconInstance;

    /// Called by match director logic once the late-game conditions are met.
    public bool TryTriggerExtraction(float matchTimeFraction, int playersAlive)
    {
        if (State != ExtractionState.Inactive) return false;
        if (matchTimeFraction < earliestActivationFraction) return false;
        if (playersAlive < minPlayersAliveToTrigger) return false;

        StartCoroutine(RunExtractionSequence());
        return true;
    }

    private IEnumerator RunExtractionSequence()
    {
        State = ExtractionState.Telegraphed;
        SeatsRemaining = seatCount;
        boardedPlayers.Clear();

        Vector3 zonePosition = helicopterSpawnPoint != null ? helicopterSpawnPoint.position : transform.position;
        if (beaconMarkerPrefab != null)
        {
            beaconInstance = Instantiate(beaconMarkerPrefab, zonePosition, Quaternion.identity);
        }
        OnZoneTelegraphed?.Invoke(zonePosition);

        yield return new WaitForSeconds(telegraphSeconds);

        helicopterInstance = helicopterPrefab != null
            ? Instantiate(helicopterPrefab, zonePosition, Quaternion.identity)
            : new GameObject("HelicopterPlaceholder");

        State = ExtractionState.Boarding;
        OnBoardingOpened?.Invoke();

        float elapsed = 0f;
        while (elapsed < boardingWindowSeconds && SeatsRemaining > 0)
        {
            elapsed += Time.deltaTime;
            yield return null;
        }

        if (beaconInstance != null) Destroy(beaconInstance);

        if (boardedPlayers.Count == 0)
        {
            State = ExtractionState.Inactive;
            OnWindowExpired?.Invoke();
            if (helicopterInstance != null) Destroy(helicopterInstance, 2f);
            yield break;
        }

        yield return StartCoroutine(DepartAndReward());
    }

    /// Call when a player interacts with the helicopter while boarding is open and within range.
    public bool TryBoardPlayer(Transform player)
    {
        if (State != ExtractionState.Boarding || SeatsRemaining <= 0) return false;
        if (boardedPlayers.Contains(player)) return false;

        Vector3 zonePosition = helicopterSpawnPoint != null ? helicopterSpawnPoint.position : transform.position;
        if (Vector3.Distance(player.position, zonePosition) > boardingRadius) return false;

        boardedPlayers.Add(player);
        SeatsRemaining--;
        if (player != null) player.SetParent(helicopterInstance != null ? helicopterInstance.transform : null);

        OnPlayerBoarded?.Invoke(player);
        return true;
    }

    private IEnumerator DepartAndReward()
    {
        State = ExtractionState.Departing;
        Vector3 startPos = helicopterInstance.transform.position;
        Vector3 exitPos = startPos + Vector3.up * 300f + transform.forward * 500f;

        float elapsed = 0f;
        while (elapsed < departureFlightSeconds)
        {
            elapsed += Time.deltaTime;
            float t = elapsed / departureFlightSeconds;
            helicopterInstance.transform.position = Vector3.Lerp(startPos, exitPos, t);
            yield return null;
        }

        foreach (Transform passenger in boardedPlayers)
        {
            if (passenger == null) continue;
            passenger.SetParent(null);
            // Score system hook: call your score component's AddBonus(survivalBonusScore) here.
        }

        OnHelicopterDeparted?.Invoke();
        Destroy(helicopterInstance);
        State = ExtractionState.Complete;
    }

    public int SurvivalBonusScore => survivalBonusScore;
    public IReadOnlyList<Transform> BoardedPlayers => boardedPlayers;
}
