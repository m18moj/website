/*
 * ScripForge — Champion Squad Spotlight Camera
 * Pack: Apex Legends Pack | Category: HUD
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * End-of-match cinematic camera that cycles through the winning squad's final kills and positioning.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections;
using System.Collections.Generic;
using UnrealEngine;

[Serializable]
public struct SpotlightShot
{
    public string playerId;
    public Vector3 focusPosition;
    public Vector3 cameraOffset;
    public float holdDurationSeconds;
    public bool isKillHighlight;
}

/// Drives the champion squad camera sequence shown after a match ends: a short orbit on each surviving
/// player's last kill, followed by a final wide shot of the whole squad's resting positions.
public class ChampionSquadSpotlightCamera : MonoBehaviour
{
    [Header("Sequence Tuning")]
    [SerializeField] private float transitionDurationSeconds = 1.25f;
    [SerializeField] private AnimationCurve transitionEase = AnimationCurve.EaseInOut(0, 0, 1, 1);
    [SerializeField] private float orbitSpeedDegreesPerSecond = 12f;

    [Header("Final Group Shot")]
    [SerializeField] private float groupShotHoldSeconds = 6f;
    [SerializeField] private float groupShotDistance = 14f;
    [SerializeField] private float groupShotHeight = 5f;

    private readonly List<SpotlightShot> shotQueue = new List<SpotlightShot>();
    private Coroutine activeSequence;

    public bool IsPlaying { get; private set; }
    public int CurrentShotIndex { get; private set; } = -1;

    public event Action<SpotlightShot> OnShotStarted;
    public event Action OnSequenceComplete;

    /// Builds the shot list from the winning squad's recorded kills, ordered by the time each kill happened.
    public void BeginSpotlightSequence(List<SpotlightShot> killHighlights, List<Vector3> finalSquadPositions)
    {
        if (IsPlaying) StopSequence();

        shotQueue.Clear();
        shotQueue.AddRange(killHighlights);
        shotQueue.Add(BuildGroupShot(finalSquadPositions));

        activeSequence = StartCoroutine(RunSequence());
    }

    private SpotlightShot BuildGroupShot(List<Vector3> finalSquadPositions)
    {
        Vector3 center = Vector3.zero;
        if (finalSquadPositions.Count > 0)
        {
            foreach (var pos in finalSquadPositions) center += pos;
            center /= finalSquadPositions.Count;
        }

        return new SpotlightShot
        {
            playerId = "squad",
            focusPosition = center,
            cameraOffset = new Vector3(0f, groupShotHeight, -groupShotDistance),
            holdDurationSeconds = groupShotHoldSeconds,
            isKillHighlight = false
        };
    }

    private IEnumerator RunSequence()
    {
        IsPlaying = true;

        for (int i = 0; i < shotQueue.Count; i++)
        {
            CurrentShotIndex = i;
            var shot = shotQueue[i];
            OnShotStarted?.Invoke(shot);

            yield return TransitionToShot(shot);
            yield return HoldOnShot(shot);
        }

        IsPlaying = false;
        CurrentShotIndex = -1;
        OnSequenceComplete?.Invoke();
    }

    private IEnumerator TransitionToShot(SpotlightShot shot)
    {
        Vector3 startPos = transform.position;
        Vector3 targetPos = shot.focusPosition + shot.cameraOffset;
        float elapsed = 0f;

        while (elapsed < transitionDurationSeconds)
        {
            elapsed += Time.deltaTime;
            float t = transitionEase.Evaluate(Mathf.Clamp01(elapsed / transitionDurationSeconds));
            transform.position = Vector3.Lerp(startPos, targetPos, t);
            transform.LookAt(shot.focusPosition);
            yield return null;
        }

        transform.position = targetPos;
        transform.LookAt(shot.focusPosition);
    }

    private IEnumerator HoldOnShot(SpotlightShot shot)
    {
        float elapsed = 0f;
        float orbitAngle = 0f;
        Vector3 pivot = shot.focusPosition;

        while (elapsed < shot.holdDurationSeconds)
        {
            elapsed += Time.deltaTime;

            // Kill highlights get a slow orbit for drama; the closing group shot stays static and composed.
            if (shot.isKillHighlight)
            {
                orbitAngle += orbitSpeedDegreesPerSecond * Time.deltaTime;
                Quaternion rotation = Quaternion.Euler(0f, orbitAngle, 0f);
                transform.position = pivot + rotation * shot.cameraOffset;
                transform.LookAt(pivot);
            }

            yield return null;
        }
    }

    /// Aborts the current spotlight sequence early, e.g. if a player skips the end-of-match cinematic.
    public void StopSequence()
    {
        if (activeSequence != null)
        {
            StopCoroutine(activeSequence);
            activeSequence = null;
        }

        IsPlaying = false;
        CurrentShotIndex = -1;
    }
}
