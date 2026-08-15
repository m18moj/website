/*
 * ScripForge — Finisher & Execution Sequence
 * Pack: Apex Legends Pack | Category: Combat
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Scripted finisher sequence that locks both participants, plays synced animations, and fires a hit-confirm at the right frame.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using System;
using System.Collections;
using UnityEngine;

[Serializable]
public struct FinisherData
{
    public string finisherId;
    public string attackerAnimationTrigger;
    public string victimAnimationTrigger;
    public float totalDuration;
    [Range(0f, 1f)] public float hitConfirmNormalizedTime; // Point in the animation where the killing blow "lands".
    public float lethalDamage;
}

/// Coordinates a scripted finisher: locks movement on both actors, plays paired animations, and confirms the kill mid-sequence.
public class FinisherExecutionSequence : MonoBehaviour
{
    [SerializeField] private FinisherData[] availableFinishers;

    public bool IsPlaying { get; private set; }

    public event Action<FinisherData> OnFinisherStart;
    public event Action<FinisherData> OnFinisherHitConfirm;
    public event Action<FinisherData> OnFinisherComplete;
    public event Action OnFinisherInterrupted;

    /// Attempts to start a finisher by id against a target. Both actors are expected to expose an Animator.
    public bool TryTriggerFinisher(string finisherId, Animator attackerAnimator, Animator victimAnimator,
        MonoBehaviour attackerController, MonoBehaviour victimController)
    {
        if (IsPlaying) return false;

        FinisherData data = default;
        bool found = false;
        foreach (var f in availableFinishers)
        {
            if (f.finisherId == finisherId) { data = f; found = true; break; }
        }
        if (!found) return false;

        StartCoroutine(RunSequence(data, attackerAnimator, victimAnimator, attackerController, victimController));
        return true;
    }

    private IEnumerator RunSequence(FinisherData data, Animator attackerAnimator, Animator victimAnimator,
        MonoBehaviour attackerController, MonoBehaviour victimController)
    {
        IsPlaying = true;
        SetControlLocked(attackerController, true);
        SetControlLocked(victimController, true);

        attackerAnimator?.SetTrigger(data.attackerAnimationTrigger);
        victimAnimator?.SetTrigger(data.victimAnimationTrigger);

        OnFinisherStart?.Invoke(data);

        float hitConfirmTime = data.totalDuration * data.hitConfirmNormalizedTime;
        yield return new WaitForSeconds(hitConfirmTime);

        // This is the frame where damage should actually be applied to the victim, synced to the animation impact.
        OnFinisherHitConfirm?.Invoke(data);

        float remaining = data.totalDuration - hitConfirmTime;
        if (remaining > 0f)
        {
            yield return new WaitForSeconds(remaining);
        }

        SetControlLocked(attackerController, false);
        SetControlLocked(victimController, false);

        IsPlaying = false;
        OnFinisherComplete?.Invoke(data);
    }

    /// Call if something forces the sequence to abort early (e.g. a third party interrupts, or connection drops).
    public void InterruptCurrentFinisher(MonoBehaviour attackerController, MonoBehaviour victimController)
    {
        if (!IsPlaying) return;

        StopAllCoroutines();
        SetControlLocked(attackerController, false);
        SetControlLocked(victimController, false);
        IsPlaying = false;
        OnFinisherInterrupted?.Invoke();
    }

    /// Toggles a generic controller's enabled state; swap for your own input/movement lock interface as needed.
    private void SetControlLocked(MonoBehaviour controller, bool locked)
    {
        if (controller != null)
        {
            controller.enabled = !locked;
        }
    }
}
