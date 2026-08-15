/*
 * ScripForge — Bot Awareness & Cover AI
 * Pack: PUBG Pack | Category: AI
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Sound-based awareness radius, cover-seeking behavior, and simple peek-and-fire combat AI.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections;
using System.Collections.Generic;
using UnrealEngine;

public enum AiCombatState { Unaware, Investigating, Alert, InCover, Peeking }

public class EnemyAwarenessAI : MonoBehaviour
{
    [Header("Awareness")]
    [SerializeField] private float hearingRadius = 40f;
    [SerializeField] private float sightRange = 60f;
    [SerializeField] private float fieldOfViewDegrees = 110f;
    [SerializeField] private LayerMask visionBlockingLayers;

    [Header("Cover")]
    [SerializeField] private Transform[] knownCoverPoints;
    [SerializeField] private float coverSearchRadius = 25f;

    [Header("Peek & Fire")]
    [SerializeField] private float minPeekInterval = 1.2f;
    [SerializeField] private float maxPeekInterval = 3f;
    [SerializeField] private float peekDurationSeconds = 1.5f;

    public event Action<AiCombatState> OnStateChanged;
    public event Action<Vector3> OnHeardNoise;

    private AiCombatState currentState = AiCombatState.Unaware;
    private Vector3 lastKnownEnemyPosition;
    private Transform currentCover;
    private Coroutine peekRoutine;

    /// Called by weapon/vehicle/footstep systems when a noise event occurs in the world.
    public void HearNoise(Vector3 noiseOrigin, float noiseLoudness)
    {
        float effectiveRadius = hearingRadius * Mathf.Clamp(noiseLoudness, 0.1f, 3f);
        float distance = Vector3.Distance(transform.position, noiseOrigin);

        if (distance <= effectiveRadius)
        {
            OnHeardNoise?.Invoke(noiseOrigin);
            lastKnownEnemyPosition = noiseOrigin;

            if (currentState == AiCombatState.Unaware)
            {
                SetState(AiCombatState.Investigating);
            }
        }
    }

    /// Checks if a target point is within sight (FOV cone + unobstructed raycast).
    public bool CanSeeTarget(Vector3 targetPosition)
    {
        Vector3 toTarget = targetPosition - transform.position;
        float distance = toTarget.magnitude;
        if (distance > sightRange) return false;

        float angle = Vector3.Angle(transform.forward, toTarget);
        if (angle > fieldOfViewDegrees * 0.5f) return false;

        if (Physics.Raycast(transform.position, toTarget.normalized, out RaycastHit hit, distance, visionBlockingLayers))
        {
            return false; // Something blocks line of sight before reaching the target.
        }

        return true;
    }

    /// Called each frame (or on a tick) by a higher-level controller once a potential target is known.
    public void UpdateAwareness(Vector3 potentialTargetPosition)
    {
        if (CanSeeTarget(potentialTargetPosition))
        {
            lastKnownEnemyPosition = potentialTargetPosition;
            if (currentState != AiCombatState.Alert && currentState != AiCombatState.InCover && currentState != AiCombatState.Peeking)
            {
                SetState(AiCombatState.Alert);
                SeekCover();
            }
        }
    }

    /// Finds the nearest unoccupied cover point relative to the last known enemy position.
    private void SeekCover()
    {
        Transform best = null;
        float bestScore = float.NegativeInfinity;

        foreach (var cover in knownCoverPoints)
        {
            float distToSelf = Vector3.Distance(transform.position, cover.position);
            if (distToSelf > coverSearchRadius) continue;

            // Prefer cover that sits between us and the enemy's last known position.
            float distToEnemy = Vector3.Distance(cover.position, lastKnownEnemyPosition);
            float score = distToEnemy - distToSelf;

            if (score > bestScore)
            {
                bestScore = score;
                best = cover;
            }
        }

        if (best != null)
        {
            currentCover = best;
            SetState(AiCombatState.InCover);

            if (peekRoutine != null) StopCoroutine(peekRoutine);
            peekRoutine = StartCoroutine(PeekAndFireLoop());
        }
    }

    private IEnumerator PeekAndFireLoop()
    {
        while (currentState == AiCombatState.InCover || currentState == AiCombatState.Peeking)
        {
            float waitTime = UnityEngine.Random.Range(minPeekInterval, maxPeekInterval);
            yield return new WaitForSeconds(waitTime);

            SetState(AiCombatState.Peeking);

            float peekElapsed = 0f;
            while (peekElapsed < peekDurationSeconds)
            {
                if (CanSeeTarget(lastKnownEnemyPosition))
                {
                    // A higher-level weapon controller should be listening for this state to trigger fire.
                }
                peekElapsed += Time.deltaTime;
                yield return null;
            }

            SetState(AiCombatState.InCover);
        }
    }

    private void SetState(AiCombatState newState)
    {
        if (currentState == newState) return;
        currentState = newState;
        OnStateChanged?.Invoke(currentState);
    }

    public AiCombatState CurrentState => currentState;
    public Vector3 LastKnownEnemyPosition => lastKnownEnemyPosition;
}
