/*
 * ScripForge — Ranked Season Reset & Placement Matches
 * Pack: PUBG Pack | Category: Progression
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Season-boundary rank soft-reset with placement-match MMR calibration before ranked tiers resume.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using System;
using System.Collections.Generic;
using UnityEngine;

public enum SeasonRankStage { AwaitingReset, InPlacements, Calibrated }

[Serializable]
public class PlacementMatchResult
{
    public int placement;
    public int kills;
    public float performanceScore; // Precomputed by your own match-scoring logic.
}

/// Handles the transition between ranked seasons: applies a soft reset toward the map's midpoint,
/// then requires a fixed number of placement matches before a real ranked tier is assigned again.
public class RankedSeasonResetPlacementMatches : MonoBehaviour
{
    [Header("Soft Reset")]
    [Tooltip("How strongly the previous season's MMR pulls toward the reset midpoint. 0 = no change, 1 = full reset.")]
    [Range(0f, 1f)]
    [SerializeField] private float softResetPullFraction = 0.4f;
    [SerializeField] private int resetMidpointMMR = 1200;

    [Header("Placement Matches")]
    [SerializeField] private int requiredPlacementMatches = 5;
    [SerializeField] private int baseCalibrationSwing = 60;

    public SeasonRankStage Stage { get; private set; } = SeasonRankStage.AwaitingReset;
    public int CurrentMMR { get; private set; }
    public int PlacementMatchesCompleted => placementResults.Count;

    public event Action<int, int> OnSeasonReset; // previousMMR, softResetMMR
    public event Action<int, int> OnPlacementMatchRecorded; // matchIndex, provisionalMMR
    public event Action<int> OnCalibrationComplete; // finalMMR

    private readonly List<PlacementMatchResult> placementResults = new List<PlacementMatchResult>();

    /// Call once at the start of a new ranked season, passing the player's ending MMR from last season.
    public void BeginNewSeason(int previousSeasonMMR)
    {
        int softResetMMR = Mathf.RoundToInt(
            Mathf.Lerp(previousSeasonMMR, resetMidpointMMR, softResetPullFraction));

        CurrentMMR = softResetMMR;
        Stage = SeasonRankStage.InPlacements;
        placementResults.Clear();

        OnSeasonReset?.Invoke(previousSeasonMMR, softResetMMR);
    }

    /// Feeds a completed placement match into the calibration set. Provisional MMR updates after
    /// each match so UI can show live movement, but the tier stays hidden until calibration finishes.
    public void ReportPlacementMatch(PlacementMatchResult result)
    {
        if (Stage != SeasonRankStage.InPlacements) return;

        placementResults.Add(result);

        int swing = Mathf.RoundToInt(baseCalibrationSwing * NormalizePerformance(result));
        CurrentMMR = Mathf.Max(0, CurrentMMR + swing);

        OnPlacementMatchRecorded?.Invoke(placementResults.Count, CurrentMMR);

        if (placementResults.Count >= requiredPlacementMatches)
        {
            FinalizeCalibration();
        }
    }

    /// Converts a placement + kills + score blend into a -1..1 performance signal for MMR swing scaling.
    private float NormalizePerformance(PlacementMatchResult result)
    {
        float placementScore = Mathf.Clamp01(1f - (result.placement - 1) / 99f);
        float killScore = Mathf.Clamp01(result.kills / 8f);
        float blended = placementScore * 0.6f + killScore * 0.25f + Mathf.Clamp01(result.performanceScore) * 0.15f;

        return (blended * 2f) - 1f; // Remap 0..1 to -1..1 so poor matches can pull MMR down.
    }

    private void FinalizeCalibration()
    {
        // Weight later placement matches slightly heavier, on the theory that early matches
        // include more adjustment noise while the player re-finds their form.
        float weightedTotal = 0f;
        float weightSum = 0f;

        for (int i = 0; i < placementResults.Count; i++)
        {
            float weight = 1f + (i / (float)placementResults.Count) * 0.5f;
            weightedTotal += NormalizePerformance(placementResults[i]) * weight;
            weightSum += weight;
        }

        float averagePerformance = weightSum > 0f ? weightedTotal / weightSum : 0f;
        int finalAdjustment = Mathf.RoundToInt(averagePerformance * baseCalibrationSwing * 1.5f);

        CurrentMMR = Mathf.Max(0, CurrentMMR + finalAdjustment);
        Stage = SeasonRankStage.Calibrated;

        OnCalibrationComplete?.Invoke(CurrentMMR);
    }

    public IReadOnlyList<PlacementMatchResult> PlacementResults => placementResults;
    public int MatchesRemaining => Mathf.Max(0, requiredPlacementMatches - placementResults.Count);
}
