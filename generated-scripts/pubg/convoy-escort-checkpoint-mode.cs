/*
 * ScripForge — Convoy Escort & Checkpoint Mode
 * Pack: PUBG Pack | Category: Events
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * A timed convoy escort objective with checkpoint capture and escalating enemy spawn waves.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;

[Serializable]
public class ConvoyCheckpoint
{
    public string checkpointId;
    public Transform checkpointTransform;
    [Tooltip("Seconds the convoy must dwell at this checkpoint, uncontested, before it's captured.")]
    public float captureHoldSeconds = 20f;
    [HideInInspector] public bool isCaptured;
}

[Serializable]
public class EnemySpawnWaveDefinition
{
    public string waveId;
    public int enemyCount = 4;
    [Tooltip("Multiplier applied to enemyCount for each checkpoint already captured before this wave spawns.")]
    public float escalationPerCheckpoint = 0.5f;
}

/// Drives a full convoy-escort event: the convoy advances checkpoint by checkpoint, each capture
/// requires an uncontested hold timer, and every checkpoint reached triggers an enemy wave that
/// scales in size with how far the convoy has already progressed. The event ends when every
/// checkpoint is captured or the convoy's health/timer budget runs out.
public class ConvoyEscortCheckpointMode : MonoBehaviour
{
    [Header("Route")]
    [SerializeField] private ConvoyCheckpoint[] checkpoints;
    [SerializeField] private float convoyMoveSpeed = 3.5f;
    [SerializeField] private Transform convoyTransform;

    [Header("Enemy Waves")]
    [SerializeField] private EnemySpawnWaveDefinition baseWave;
    [SerializeField] private float waveSpawnDelaySeconds = 2f;

    [Header("Event Budget")]
    [SerializeField] private float totalEventTimeLimitSeconds = 600f;
    [SerializeField] private float convoyMaxHealth = 500f;

    public bool IsEventActive { get; private set; }
    public bool IsEventComplete { get; private set; }
    public bool IsEventFailed { get; private set; }
    public int CurrentCheckpointIndex { get; private set; }
    public float ConvoyHealth { get; private set; }
    public float EventTimeRemaining { get; private set; }
    public bool IsConvoyContested { get; private set; }

    public event Action OnEventStarted;
    public event Action<ConvoyCheckpoint> OnCheckpointCaptured;
    public event Action<int> OnEnemyWaveSpawned; // enemyCountForWave
    public event Action OnEventCompleted;
    public event Action OnEventFailed;
    public event Action<float> OnConvoyHealthChanged;

    private Coroutine eventRoutine;
    private float checkpointHoldProgress;

    /// Begins the convoy escort event: resets state and starts the route/timer coroutine.
    public void StartEvent()
    {
        if (IsEventActive) return;

        CurrentCheckpointIndex = 0;
        ConvoyHealth = convoyMaxHealth;
        EventTimeRemaining = totalEventTimeLimitSeconds;
        checkpointHoldProgress = 0f;
        IsEventActive = true;
        IsEventComplete = false;
        IsEventFailed = false;

        foreach (ConvoyCheckpoint checkpoint in checkpoints)
        {
            checkpoint.isCaptured = false;
        }

        OnEventStarted?.Invoke();

        if (eventRoutine != null) StopCoroutine(eventRoutine);
        eventRoutine = StartCoroutine(RunEvent());
    }

    private IEnumerator RunEvent()
    {
        while (IsEventActive && CurrentCheckpointIndex < checkpoints.Length)
        {
            ConvoyCheckpoint target = checkpoints[CurrentCheckpointIndex];

            yield return StartCoroutine(SpawnWaveForCheckpoint(CurrentCheckpointIndex));
            yield return StartCoroutine(AdvanceToCheckpoint(target));

            if (!IsEventActive) yield break;

            yield return StartCoroutine(HoldForCapture(target));

            if (!IsEventActive) yield break;

            target.isCaptured = true;
            OnCheckpointCaptured?.Invoke(target);
            CurrentCheckpointIndex++;
        }

        if (IsEventActive)
        {
            CompleteEvent();
        }
    }

    private IEnumerator SpawnWaveForCheckpoint(int checkpointIndex)
    {
        yield return new WaitForSeconds(waveSpawnDelaySeconds);

        int scaledCount = Mathf.RoundToInt(
            baseWave.enemyCount * (1f + baseWave.escalationPerCheckpoint * checkpointIndex));

        OnEnemyWaveSpawned?.Invoke(scaledCount);
    }

    private IEnumerator AdvanceToCheckpoint(ConvoyCheckpoint target)
    {
        if (convoyTransform == null || target.checkpointTransform == null) yield break;

        while (Vector3.Distance(convoyTransform.position, target.checkpointTransform.position) > 0.5f)
        {
            if (!IsEventActive) yield break;

            convoyTransform.position = Vector3.MoveTowards(
                convoyTransform.position,
                target.checkpointTransform.position,
                convoyMoveSpeed * Time.deltaTime);

            yield return null;
        }
    }

    private IEnumerator HoldForCapture(ConvoyCheckpoint target)
    {
        checkpointHoldProgress = 0f;

        while (checkpointHoldProgress < target.captureHoldSeconds)
        {
            if (!IsEventActive) yield break;

            if (!IsConvoyContested)
            {
                checkpointHoldProgress += Time.deltaTime;
            }

            yield return null;
        }
    }

    /// Should be wired to a trigger volume or AI awareness check that flags when hostiles are near the convoy.
    public void SetConvoyContested(bool contested)
    {
        IsConvoyContested = contested;
    }

    /// Applies damage to the convoy's shared health pool; failing the event if it reaches zero.
    public void ApplyConvoyDamage(float amount)
    {
        if (!IsEventActive || amount <= 0f) return;

        ConvoyHealth = Mathf.Max(0f, ConvoyHealth - amount);
        OnConvoyHealthChanged?.Invoke(ConvoyHealth);

        if (ConvoyHealth <= 0f)
        {
            FailEvent();
        }
    }

    private void Update()
    {
        if (!IsEventActive) return;

        EventTimeRemaining -= Time.deltaTime;
        if (EventTimeRemaining <= 0f)
        {
            EventTimeRemaining = 0f;
            FailEvent();
        }
    }

    private void CompleteEvent()
    {
        IsEventActive = false;
        IsEventComplete = true;

        if (eventRoutine != null)
        {
            StopCoroutine(eventRoutine);
            eventRoutine = null;
        }

        OnEventCompleted?.Invoke();
    }

    private void FailEvent()
    {
        IsEventActive = false;
        IsEventFailed = true;

        if (eventRoutine != null)
        {
            StopCoroutine(eventRoutine);
            eventRoutine = null;
        }

        OnEventFailed?.Invoke();
    }

    public float ConvoyHealthFraction01 => convoyMaxHealth <= 0f ? 0f : ConvoyHealth / convoyMaxHealth;
    public int CheckpointsCaptured => CurrentCheckpointIndex;
    public int TotalCheckpoints => checkpoints != null ? checkpoints.Length : 0;
}
