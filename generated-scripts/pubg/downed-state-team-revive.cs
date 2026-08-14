/*
 * ScriptForge — Downed State & Team Revive
 * Pack: PUBG Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Crawl-and-call-for-help downed state that bleeds out over time unless a teammate channels a revive.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using System;
using UnityEngine;

/// Tracks a player's downed (knocked) state: crawl movement, bleed-out timer, and team-revive interaction.
public class DownedStateTeamRevive : MonoBehaviour
{
    [Header("Downed Settings")]
    [SerializeField] private float bleedOutSeconds = 90f;
    [SerializeField] private float crawlSpeedMultiplier = 0.2f;
    [SerializeField] private float reviveHealthOnComplete = 40f;

    [Header("Revive Interaction")]
    [SerializeField] private float reviveChannelSeconds = 6f;
    [SerializeField] private float reviveInteractRange = 2.5f;
    [Tooltip("If true, revive progress is lost when the reviver steps out of range or is interrupted.")]
    [SerializeField] private bool resetProgressOnInterrupt = true;

    public bool IsDowned { get; private set; }
    public float BleedOutRemaining { get; private set; }
    public float ReviveProgress01 { get; private set; }

    public event Action OnDowned;
    public event Action OnBledOut;      // Downed player fully dies.
    public event Action OnRevived;      // Successfully picked back up.
    public event Action<Transform> OnReviveStarted;
    public event Action OnReviveInterrupted;

    private Transform activeReviver;
    private float reviveTimer;

    /// Call when this player's health drops to zero but the game rules allow a downed state instead of death.
    public void EnterDownedState()
    {
        if (IsDowned) return;

        IsDowned = true;
        BleedOutRemaining = bleedOutSeconds;
        ReviveProgress01 = 0f;
        activeReviver = null;
        OnDowned?.Invoke();
    }

    private void Update()
    {
        if (!IsDowned) return;

        BleedOutRemaining -= Time.deltaTime;
        if (BleedOutRemaining <= 0f)
        {
            FinalizeBleedOut();
            return;
        }

        if (activeReviver != null)
        {
            float distance = Vector3.Distance(activeReviver.position, transform.position);
            if (distance > reviveInteractRange)
            {
                InterruptRevive();
                return;
            }

            reviveTimer += Time.deltaTime;
            ReviveProgress01 = Mathf.Clamp01(reviveTimer / reviveChannelSeconds);

            if (ReviveProgress01 >= 1f)
            {
                CompleteRevive();
            }
        }
    }

    /// A teammate begins channeling the revive interaction on this downed player.
    public bool TryStartRevive(Transform reviver)
    {
        if (!IsDowned || activeReviver != null) return false;
        if (Vector3.Distance(reviver.position, transform.position) > reviveInteractRange) return false;

        activeReviver = reviver;
        reviveTimer = 0f;
        OnReviveStarted?.Invoke(reviver);
        return true;
    }

    /// Call if the reviver releases the interact button, dies, or gets shot off the revive.
    public void InterruptRevive()
    {
        if (activeReviver == null) return;

        activeReviver = null;
        if (resetProgressOnInterrupt)
        {
            reviveTimer = 0f;
            ReviveProgress01 = 0f;
        }
        OnReviveInterrupted?.Invoke();
    }

    private void CompleteRevive()
    {
        IsDowned = false;
        activeReviver = null;
        ReviveProgress01 = 0f;
        OnRevived?.Invoke();
        // Health restoration hook: call your health component's Heal(reviveHealthOnComplete) here.
    }

    private void FinalizeBleedOut()
    {
        IsDowned = false;
        activeReviver = null;
        OnBledOut?.Invoke();
    }

    public float CurrentMoveSpeedMultiplier => IsDowned ? crawlSpeedMultiplier : 1f;
    public float ReviveHealAmount => reviveHealthOnComplete;
}
