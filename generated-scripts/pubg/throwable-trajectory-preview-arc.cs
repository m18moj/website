/*
 * ScripForge — Throwable Trajectory Preview Arc
 * Pack: PUBG Pack | Category: Weapons
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * A predictive arc preview line for grenades and Molotovs before release, scaled by throw power.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using System;
using UnityEngine;

/// Draws a sampled projectile-motion preview line from a throw origin, updating each frame while the
/// player charges/holds a throwable, and reports where the arc first intersects world geometry.
[RequireComponent(typeof(LineRenderer))]
public class ThrowableTrajectoryPreviewArc : MonoBehaviour
{
    [Header("Origin")]
    [SerializeField] private Transform throwOrigin;

    [Header("Arc Sampling")]
    [SerializeField] private int sampleCount = 30;
    [SerializeField] private float sampleTimeStep = 0.08f;
    [SerializeField] private LayerMask groundCollisionMask = ~0;

    [Header("Throw Power")]
    [SerializeField] private float minThrowSpeed = 6f;
    [SerializeField] private float maxThrowSpeed = 22f;
    [SerializeField] private float upwardArcBias = 0.3f;

    [Header("Visuals")]
    [SerializeField] private Gradient lowPowerColor;
    [SerializeField] private Gradient highPowerColor;

    public bool IsPreviewing { get; private set; }
    public Vector3 PredictedImpactPoint { get; private set; }

    public event Action<Vector3> OnImpactPointChanged;

    private LineRenderer line;
    private Vector3[] pointBuffer;

    private void Awake()
    {
        line = GetComponent<LineRenderer>();
        pointBuffer = new Vector3[Mathf.Max(2, sampleCount)];
        line.positionCount = pointBuffer.Length;
        line.enabled = false;
    }

    public void BeginPreview()
    {
        IsPreviewing = true;
        line.enabled = true;
    }

    public void EndPreview()
    {
        IsPreviewing = false;
        line.enabled = false;
    }

    /// Call every frame while the throwable is being charged/aimed. throwPower01 is normalized 0-1
    /// from however the input system measures charge (e.g. hold duration or trigger pull).
    public void UpdatePreview(Vector3 aimDirection, float throwPower01)
    {
        if (!IsPreviewing || throwOrigin == null) return;

        float speed = Mathf.Lerp(minThrowSpeed, maxThrowSpeed, Mathf.Clamp01(throwPower01));
        Vector3 launchDirection = (aimDirection.normalized + Vector3.up * upwardArcBias).normalized;
        Vector3 velocity = launchDirection * speed;
        Vector3 origin = throwOrigin.position;
        Vector3 gravity = Physics.gravity;

        bool hitFound = false;
        Vector3 lastPoint = origin;

        for (int i = 0; i < pointBuffer.Length; i++)
        {
            float t = i * sampleTimeStep;
            Vector3 point = origin + velocity * t + 0.5f * gravity * t * t;

            if (!hitFound && i > 0 && Physics.Linecast(lastPoint, point, out RaycastHit hit, groundCollisionMask))
            {
                point = hit.point;
                hitFound = true;
                PredictedImpactPoint = point;
                OnImpactPointChanged?.Invoke(point);

                // Fill remaining samples with the impact point so the line doesn't continue past it.
                for (int j = i; j < pointBuffer.Length; j++) pointBuffer[j] = point;
                break;
            }

            pointBuffer[i] = point;
            lastPoint = point;
        }

        if (!hitFound)
        {
            PredictedImpactPoint = pointBuffer[pointBuffer.Length - 1];
            OnImpactPointChanged?.Invoke(PredictedImpactPoint);
        }

        line.SetPositions(pointBuffer);
        ApplyPowerColor(throwPower01);
    }

    private void ApplyPowerColor(float throwPower01)
    {
        if (lowPowerColor == null || highPowerColor == null) return;

        // Blend the two gradients' colors along the arc based on charge strength as a simple visual cue.
        Gradient blended = throwPower01 < 0.5f ? lowPowerColor : highPowerColor;
        line.colorGradient = blended;
    }

    public void SetOrigin(Transform newOrigin) => throwOrigin = newOrigin;
}
