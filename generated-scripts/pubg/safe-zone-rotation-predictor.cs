/*
 * ScripForge — Safe Zone Rotation Predictor
 * Pack: PUBG Pack | Category: World
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Heuristic predictor that estimates the next safe-zone center and radius using the shrinking-circle pattern.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using System;
using System.Collections.Generic;
using UnityEngine;

/// Estimates where the next play-zone circle is likely to land, given the current and prior zone history.
/// Purely a design/UX helper for things like a "predicted zone" overlay — not tied to the authoritative
/// zone logic, which should always be driven by your own match server or ZoneCollapseSystem.
public class SafeZoneRotationPredictor : MonoBehaviour
{
    [Header("Prediction Model")]
    [Tooltip("Next radius as a fraction of the current radius, matching your zone shrink schedule.")]
    [SerializeField] private float nextRadiusFraction = 0.55f;
    [Tooltip("How strongly the predicted center is pulled toward the historical drift direction (0 = ignore history).")]
    [SerializeField] private float driftBiasStrength = 0.35f;
    [Tooltip("Random spread applied to the predicted center to represent genuine uncertainty, as a fraction of the new radius.")]
    [SerializeField] private float uncertaintyFraction = 0.25f;

    private readonly List<Vector2> zoneCenterHistory = new List<Vector2>();

    public event Action<Vector2, float> OnPredictionUpdated; // predicted center, predicted radius

    /// Call each time a new safe zone circle is confirmed, to keep the drift history current.
    public void RecordConfirmedZone(Vector2 center, float radius)
    {
        zoneCenterHistory.Add(center);
        if (zoneCenterHistory.Count > 8) zoneCenterHistory.RemoveAt(0);
    }

    /// Produces a best-guess next zone using: must fit inside current zone, biased along historical drift direction.
    public (Vector2 center, float radius) PredictNextZone(Vector2 currentCenter, float currentRadius)
    {
        float predictedRadius = currentRadius * nextRadiusFraction;
        float maxCenterOffset = currentRadius - predictedRadius; // Predicted circle must stay within the current one.

        Vector2 driftDirection = ComputeDriftDirection();
        Vector2 biasedOffset = driftDirection * (maxCenterOffset * driftBiasStrength);

        Vector2 randomOffset = UnityEngine.Random.insideUnitCircle * (predictedRadius * uncertaintyFraction);
        Vector2 predictedCenter = currentCenter + biasedOffset + randomOffset;

        // Clamp the predicted center so the predicted circle never pokes outside the current zone.
        Vector2 fromCurrent = predictedCenter - currentCenter;
        if (fromCurrent.magnitude > maxCenterOffset && maxCenterOffset > 0f)
        {
            predictedCenter = currentCenter + fromCurrent.normalized * maxCenterOffset;
        }

        OnPredictionUpdated?.Invoke(predictedCenter, predictedRadius);
        return (predictedCenter, predictedRadius);
    }

    /// Historical zones tend to drift in a consistent direction across a match; average the recent deltas.
    private Vector2 ComputeDriftDirection()
    {
        if (zoneCenterHistory.Count < 2) return Vector2.zero;

        Vector2 accumulatedDelta = Vector2.zero;
        int sampleCount = 0;

        for (int i = 1; i < zoneCenterHistory.Count; i++)
        {
            accumulatedDelta += zoneCenterHistory[i] - zoneCenterHistory[i - 1];
            sampleCount++;
        }

        if (sampleCount == 0 || accumulatedDelta.sqrMagnitude < 0.0001f) return Vector2.zero;
        return (accumulatedDelta / sampleCount).normalized;
    }

    /// Convenience overload for worlds using XZ-plane Vector3 positions instead of raw Vector2.
    public (Vector3 center, float radius) PredictNextZone(Vector3 currentCenter, float currentRadius)
    {
        Vector2 flatCenter = new Vector2(currentCenter.x, currentCenter.z);
        (Vector2 center, float radius) result = PredictNextZone(flatCenter, currentRadius);
        return (new Vector3(result.center.x, currentCenter.y, result.center.y), result.radius);
    }

    public void ClearHistory() => zoneCenterHistory.Clear();
}
