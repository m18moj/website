/*
 * ScriptForge — Knockdown & Respawn Beacon
 * Pack: Apex Legends Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Bleed-out timers, self-revive items, and squad respawn beacons.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections;
using UnrealEngine;

public enum PlayerLifeState { Alive, Knocked, Eliminated }

public class KnockdownRespawnFlow : MonoBehaviour
{
    [Header("Knockdown / Bleed-out")]
    [SerializeField] private float bleedOutDurationSeconds = 45f;
    [SerializeField] private float knockedHealth = 50f;

    [Header("Self-Revive")]
    [SerializeField] private float selfReviveDurationSeconds = 8f;
    [SerializeField] private int selfReviveChargesCarried = 0;

    [Header("Respawn Beacon")]
    [SerializeField] private float beaconRespawnDelaySeconds = 15f;
    [SerializeField] private Transform beaconDropPoint;

    public PlayerLifeState LifeState { get; private set; } = PlayerLifeState.Alive;
    public float BleedOutRemaining { get; private set; }
    public float KnockedHealthRemaining { get; private set; }

    public event Action OnKnockedDown;
    public event Action OnSelfRevived;
    public event Action OnEliminated;
    public event Action OnRespawned;

    private Coroutine bleedOutRoutine;
    private Coroutine selfReviveRoutine;

    /// Called when incoming damage would drop the player below zero health while alive.
    public void Knockdown()
    {
        if (LifeState != PlayerLifeState.Alive) return;

        LifeState = PlayerLifeState.Knocked;
        KnockedHealthRemaining = knockedHealth;
        BleedOutRemaining = bleedOutDurationSeconds;

        OnKnockedDown?.Invoke();
        bleedOutRoutine = StartCoroutine(BleedOutTimer());
    }

    private IEnumerator BleedOutTimer()
    {
        while (BleedOutRemaining > 0f && LifeState == PlayerLifeState.Knocked)
        {
            BleedOutRemaining -= Time.deltaTime;
            yield return null;
        }

        if (LifeState == PlayerLifeState.Knocked)
        {
            Eliminate();
        }
    }

    /// Damage taken by a downed player from crossfire further reduces their bleed-out window and health.
    public void TakeKnockedDamage(float amount)
    {
        if (LifeState != PlayerLifeState.Knocked) return;

        KnockedHealthRemaining -= amount;
        if (KnockedHealthRemaining <= 0f)
        {
            Eliminate();
        }
    }

    /// Squadmate interaction — revives the downed player back to Alive after a short channel (external caller handles the channel timer).
    public void ReviveBySquadmate(float reviveHealth)
    {
        if (LifeState != PlayerLifeState.Knocked) return;

        StopBleedOut();
        LifeState = PlayerLifeState.Alive;
        KnockedHealthRemaining = 0f;
        OnRespawned?.Invoke();
    }

    /// Uses a carried self-revive item; player must survive the full channel uninterrupted.
    public bool TryUseSelfRevive()
    {
        if (LifeState != PlayerLifeState.Knocked || selfReviveChargesCarried <= 0) return false;

        selfReviveChargesCarried--;
        selfReviveRoutine = StartCoroutine(SelfReviveChannel());
        return true;
    }

    private IEnumerator SelfReviveChannel()
    {
        float elapsed = 0f;
        while (elapsed < selfReviveDurationSeconds)
        {
            if (LifeState != PlayerLifeState.Knocked) yield break; // interrupted by damage/elimination
            elapsed += Time.deltaTime;
            yield return null;
        }

        StopBleedOut();
        LifeState = PlayerLifeState.Alive;
        KnockedHealthRemaining = 0f;
        OnSelfRevived?.Invoke();
    }

    private void Eliminate()
    {
        StopBleedOut();
        LifeState = PlayerLifeState.Eliminated;
        OnEliminated?.Invoke();
    }

    private void StopBleedOut()
    {
        if (bleedOutRoutine != null) StopCoroutine(bleedOutRoutine);
        if (selfReviveRoutine != null) StopCoroutine(selfReviveRoutine);
    }

    /// Squad picks up the eliminated player's banner and brings it to a beacon; called by the beacon trigger.
    public void RespawnAtBeacon()
    {
        if (LifeState != PlayerLifeState.Eliminated) return;
        StartCoroutine(BeaconRespawnDelay());
    }

    private IEnumerator BeaconRespawnDelay()
    {
        yield return new WaitForSeconds(beaconRespawnDelaySeconds);

        if (beaconDropPoint != null)
        {
            transform.position = beaconDropPoint.position;
        }

        LifeState = PlayerLifeState.Alive;
        selfReviveChargesCarried = 0; // Items are lost on beacon respawn, matching genre convention.
        OnRespawned?.Invoke();
    }

    public void GrantSelfReviveCharge(int amount = 1)
    {
        selfReviveChargesCarried += amount;
    }
}
