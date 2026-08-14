/*
 * ScriptForge — Blue Zone Shrink & Damage
 * Pack: PUBG Pack | Category: World
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Phased play-zone shrinking with damage-per-second scaling and a next-zone telegraph before each collapse.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections;
using UnrealEngine;

/// Configuration for a single shrink phase of the safe zone.
[Serializable]
public class ZonePhase
{
    public float waitSeconds = 90f;       // Telegraph time before the zone starts moving.
    public float shrinkSeconds = 60f;      // Time it takes to shrink from current to next radius.
    public float endRadius = 250f;         // Radius of the safe zone once this phase completes.
    public float damagePerSecond = 1f;     // Damage dealt per second while outside the safe zone.
}

public class ZoneCollapseSystem : MonoBehaviour
{
    [Header("Zone Phases")]
    [SerializeField] private ZonePhase[] phases;
    [SerializeField] private float startRadius = 4000f;

    [Header("Map Center")]
    [SerializeField] private Vector3 mapCenter = Vector3.zero;
    [SerializeField] private float nextZoneMinOffset = 200f;
    [SerializeField] private float nextZoneMaxOffsetFraction = 0.6f;

    public event Action<int, Vector3, float> OnPhaseTelegraphed; // phaseIndex, nextCenter, nextRadius
    public event Action<int> OnPhaseCollapseStarted;
    public event Action OnZoneClosed;

    public Vector3 CurrentCenter { get; private set; }
    public float CurrentRadius { get; private set; }
    private Vector3 nextCenter;
    private float nextRadius;
    private int currentPhaseIndex = -1;
    private bool isShrinking;

    private void Start()
    {
        CurrentCenter = mapCenter;
        CurrentRadius = startRadius;
        StartCoroutine(RunPhases());
    }

    private IEnumerator RunPhases()
    {
        for (int i = 0; i < phases.Length; i++)
        {
            currentPhaseIndex = i;
            ZonePhase phase = phases[i];

            nextRadius = phase.endRadius;
            nextCenter = PickNextCenter(CurrentCenter, CurrentRadius, nextRadius);
            OnPhaseTelegraphed?.Invoke(i, nextCenter, nextRadius);

            yield return new WaitForSeconds(phase.waitSeconds);

            OnPhaseCollapseStarted?.Invoke(i);
            isShrinking = true;

            float elapsed = 0f;
            Vector3 startCenter = CurrentCenter;
            float startRad = CurrentRadius;

            while (elapsed < phase.shrinkSeconds)
            {
                elapsed += Time.deltaTime;
                float t = Mathf.Clamp01(elapsed / phase.shrinkSeconds);
                CurrentCenter = Vector3.Lerp(startCenter, nextCenter, t);
                CurrentRadius = Mathf.Lerp(startRad, nextRadius, t);
                yield return null;
            }

            CurrentCenter = nextCenter;
            CurrentRadius = nextRadius;
            isShrinking = false;
        }

        OnZoneClosed?.Invoke();
    }

    /// Picks a random new zone center that stays within the current zone and keeps the new circle inscribed.
    private Vector3 PickNextCenter(Vector3 fromCenter, float fromRadius, float toRadius)
    {
        float maxOffset = Mathf.Max(0f, (fromRadius - toRadius) * nextZoneMaxOffsetFraction);
        float offset = UnityEngine.Random.Range(nextZoneMinOffset, Mathf.Max(nextZoneMinOffset, maxOffset));
        Vector2 dir = UnityEngine.Random.insideUnitCircle.normalized;
        Vector3 offsetVec = new Vector3(dir.x, 0f, dir.y) * offset;
        return fromCenter + offsetVec;
    }

    /// Returns true and outputs the DPS to apply if the given position is outside the current safe zone.
    public bool TryGetDamage(Vector3 worldPosition, out float damagePerSecond)
    {
        damagePerSecond = 0f;
        if (currentPhaseIndex < 0 || currentPhaseIndex >= phases.Length) return false;

        float flatDistance = Vector3.Distance(
            new Vector3(worldPosition.x, 0f, worldPosition.z),
            new Vector3(CurrentCenter.x, 0f, CurrentCenter.z));

        if (flatDistance <= CurrentRadius) return false;

        damagePerSecond = phases[currentPhaseIndex].damagePerSecond;
        return true;
    }

    public bool IsShrinking => isShrinking;
    public int CurrentPhaseIndex => currentPhaseIndex;
}
