/*
 * ScripForge — Training Ground Weapon Range
 * Pack: PUBG Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * A pre-match practice range with target dummies, ammo reset, and a personal-best accuracy tracker.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;

[Serializable]
public class TargetDummy
{
    public string dummyId;
    public Transform dummyTransform;
    [HideInInspector] public int hitCount;
    [HideInInspector] public bool isKnockedDown;
}

[Serializable]
public struct AccuracyRunResult
{
    public int shotsFired;
    public int shotsHit;
    public float accuracyPercent;
    public float runDurationSeconds;
    public DateTime completedAtUtc;
}

/// Manages a standalone practice-range volume: resets ammo and dummies on entry, tracks shots fired
/// versus shots landed for the duration of a timed run, and records a personal-best accuracy result
/// once the run ends (either by timer expiry or the player leaving the range volume).
public class TrainingGroundWeaponRange : MonoBehaviour
{
    [Header("Range Setup")]
    [SerializeField] private TargetDummy[] targetDummies;
    [SerializeField] private int startingAmmoOnEntry = 90;
    [SerializeField] private float runDurationSeconds = 60f;

    [Header("Dummy Reset")]
    [Tooltip("Seconds a knocked-down dummy stays down before automatically resetting upright.")]
    [SerializeField] private float dummyResetDelaySeconds = 3f;

    public bool IsRunActive { get; private set; }
    public int ShotsFired { get; private set; }
    public int ShotsHit { get; private set; }
    public float RunTimeRemaining { get; private set; }
    public AccuracyRunResult? PersonalBest { get; private set; }
    public AccuracyRunResult? LastRunResult { get; private set; }

    public event Action OnRunStarted;
    public event Action<AccuracyRunResult> OnRunCompleted;
    public event Action<string> OnDummyHit;
    public event Action<AccuracyRunResult> OnNewPersonalBest;

    private Coroutine runRoutine;
    private readonly Dictionary<string, Coroutine> dummyResetRoutines = new Dictionary<string, Coroutine>();
    private float runStartTime;

    /// Called when the player enters the range trigger volume: resets ammo, dummies, and starts timing.
    public void EnterRange()
    {
        if (IsRunActive) return;

        ResetAllDummies();
        ShotsFired = 0;
        ShotsHit = 0;
        RunTimeRemaining = runDurationSeconds;
        IsRunActive = true;
        runStartTime = Time.time;

        OnRunStarted?.Invoke();

        if (runRoutine != null) StopCoroutine(runRoutine);
        runRoutine = StartCoroutine(RunTimer());
    }

    /// Called when the player leaves the range volume before the timer naturally expires.
    public void ExitRange()
    {
        if (!IsRunActive) return;
        FinishRun();
    }

    private IEnumerator RunTimer()
    {
        while (RunTimeRemaining > 0f)
        {
            RunTimeRemaining -= Time.deltaTime;
            yield return null;
        }

        RunTimeRemaining = 0f;
        FinishRun();
    }

    /// Should be called by the player's weapon component whenever a shot is fired inside the range.
    public void RegisterShotFired()
    {
        if (!IsRunActive) return;
        ShotsFired++;
    }

    /// Should be called by a dummy's hit-detection component when a shot lands on it.
    public void RegisterDummyHit(string dummyId)
    {
        if (!IsRunActive) return;

        ShotsHit++;
        OnDummyHit?.Invoke(dummyId);

        TargetDummy dummy = FindDummy(dummyId);
        if (dummy != null && !dummy.isKnockedDown)
        {
            dummy.isKnockedDown = true;
            dummy.hitCount++;

            if (dummyResetRoutines.TryGetValue(dummyId, out Coroutine existing) && existing != null)
            {
                StopCoroutine(existing);
            }
            dummyResetRoutines[dummyId] = StartCoroutine(ResetDummyAfterDelay(dummy));
        }
    }

    private IEnumerator ResetDummyAfterDelay(TargetDummy dummy)
    {
        yield return new WaitForSeconds(dummyResetDelaySeconds);
        dummy.isKnockedDown = false;
    }

    private void FinishRun()
    {
        IsRunActive = false;

        if (runRoutine != null)
        {
            StopCoroutine(runRoutine);
            runRoutine = null;
        }

        float accuracy = ShotsFired <= 0 ? 0f : (ShotsHit / (float)ShotsFired) * 100f;
        AccuracyRunResult result = new AccuracyRunResult
        {
            shotsFired = ShotsFired,
            shotsHit = ShotsHit,
            accuracyPercent = accuracy,
            runDurationSeconds = Time.time - runStartTime,
            completedAtUtc = DateTime.UtcNow
        };

        LastRunResult = result;
        OnRunCompleted?.Invoke(result);

        if (ShotsFired > 0 && (PersonalBest == null || accuracy > PersonalBest.Value.accuracyPercent))
        {
            PersonalBest = result;
            OnNewPersonalBest?.Invoke(result);
        }
    }

    private void ResetAllDummies()
    {
        if (targetDummies == null) return;

        foreach (TargetDummy dummy in targetDummies)
        {
            dummy.isKnockedDown = false;
            dummy.hitCount = 0;
        }
    }

    private TargetDummy FindDummy(string dummyId)
    {
        if (targetDummies == null) return null;

        foreach (TargetDummy dummy in targetDummies)
        {
            if (dummy.dummyId == dummyId) return dummy;
        }
        return null;
    }

    public int RangeAmmoAllowance => startingAmmoOnEntry;
}
