/*
 * ScripForge — Ring Collapse & Damage Curve
 * Pack: Apex Legends Pack | Category: World
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Shrinking ring phases with escalating tick damage and next-zone telegraph.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections;
using System.Collections.Generic;
using UnrealEngine;

[Serializable]
public class RingPhase
{
    public float waitDurationSeconds = 90f;
    public float collapseDurationSeconds = 60f;
    public float endRadius = 200f;
    public float damagePerTick = 2f;
    public float tickIntervalSeconds = 1f;
}

public class RingCollapseSystem : MonoBehaviour
{
    [Header("Ring Setup")]
    [SerializeField] private List<RingPhase> phases = new List<RingPhase>();
    [SerializeField] private Vector3 mapCenter = Vector3.zero;
    [SerializeField] private float startRadius = 1500f;

    [Header("Telegraph")]
    [SerializeField] private float telegraphLeadSeconds = 20f;

    public event Action<int> OnPhaseStarted;
    public event Action<Vector3, float> OnNextZoneTelegraphed;
    public event Action<float, float> OnRingRadiusChanged; // current radius, elapsed fraction

    public float CurrentRadius { get; private set; }
    public Vector3 CurrentCenter { get; private set; }
    public int CurrentPhaseIndex { get; private set; } = -1;

    private Vector3 nextCenter;
    private float nextRadius;
    private float currentDamagePerTick;
    private float currentTickInterval;

    private void Awake()
    {
        CurrentRadius = startRadius;
        CurrentCenter = mapCenter;
    }

    public void BeginCollapseSequence()
    {
        StartCoroutine(RunPhases());
    }

    private IEnumerator RunPhases()
    {
        for (int i = 0; i < phases.Count; i++)
        {
            CurrentPhaseIndex = i;
            RingPhase phase = phases[i];
            OnPhaseStarted?.Invoke(i);

            Vector3 fromCenter = CurrentCenter;
            float fromRadius = CurrentRadius;
            PickNextZone(fromCenter, fromRadius, phase.endRadius);

            currentDamagePerTick = phase.damagePerTick;
            currentTickInterval = phase.tickIntervalSeconds;

            // Waiting period: telegraph the next circle before it starts closing in.
            float waitBeforeTelegraph = Mathf.Max(0f, phase.waitDurationSeconds - telegraphLeadSeconds);
            yield return new WaitForSeconds(waitBeforeTelegraph);

            OnNextZoneTelegraphed?.Invoke(nextCenter, nextRadius);
            yield return new WaitForSeconds(Mathf.Min(telegraphLeadSeconds, phase.waitDurationSeconds));

            // Collapse period: interpolate ring center/radius over time.
            float elapsed = 0f;
            while (elapsed < phase.collapseDurationSeconds)
            {
                elapsed += Time.deltaTime;
                float t = Mathf.Clamp01(elapsed / phase.collapseDurationSeconds);
                CurrentCenter = Vector3.Lerp(fromCenter, nextCenter, t);
                CurrentRadius = Mathf.Lerp(fromRadius, nextRadius, t);
                OnRingRadiusChanged?.Invoke(CurrentRadius, t);
                yield return null;
            }

            CurrentCenter = nextCenter;
            CurrentRadius = nextRadius;
        }
    }

    /// Picks a random next-zone center that keeps the new ring fully inside the current ring.
    private void PickNextZone(Vector3 fromCenter, float fromRadius, float newRadius)
    {
        float maxOffset = Mathf.Max(0f, fromRadius - newRadius);
        Vector2 offset2D = UnityEngine.Random.insideUnitCircle * maxOffset;
        nextCenter = fromCenter + new Vector3(offset2D.x, 0f, offset2D.y);
        nextRadius = newRadius;
    }

    /// Call every tick interval from a central damage tick coroutine, once per player outside the ring.
    public bool IsOutsideRing(Vector3 position)
    {
        Vector3 flatDiff = position - CurrentCenter;
        flatDiff.y = 0f;
        return flatDiff.magnitude > CurrentRadius;
    }

    public float GetCurrentTickDamage() => currentDamagePerTick;
    public float GetCurrentTickInterval() => currentTickInterval;
}
