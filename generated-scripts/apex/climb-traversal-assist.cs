/*
 * ScripForge — Climb & Traversal Assist
 * Pack: Apex Legends Pack | Category: Movement
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Traversal helper that detects ledges for mantling, wall climbs, and zipline attachment/travel.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using System;
using System.Collections;
using UnityEngine;

public enum TraversalState { Grounded, Mantling, Climbing, Ziplining }

[RequireComponent(typeof(CharacterController))]
public class ClimbTraversalAssist : MonoBehaviour
{
    [Header("Ledge Detection")]
    [SerializeField] private float probeDistance = 0.7f;
    [SerializeField] private float ledgeCheckHeight = 1.6f;
    [SerializeField] private LayerMask traversalMask = ~0;

    [Header("Mantle")]
    [SerializeField] private float mantleDuration = 0.4f;
    [SerializeField] private AnimationCurve mantleCurve = AnimationCurve.EaseInOut(0, 0, 1, 1);

    [Header("Zipline")]
    [SerializeField] private float ziplineSpeed = 12f;

    public TraversalState CurrentState { get; private set; } = TraversalState.Grounded;

    public event Action OnMantleStarted;
    public event Action OnMantleCompleted;
    public event Action<Transform> OnZiplineAttached;
    public event Action OnZiplineDetached;

    private CharacterController controller;

    private void Awake()
    {
        controller = GetComponent<CharacterController>();
    }

    /// Casts forward at chest height, then down from just above the obstacle, to find a mantle-able ledge in front of the player.
    public bool TryDetectLedge(out Vector3 ledgePoint)
    {
        ledgePoint = default;
        Vector3 origin = transform.position + Vector3.up * (ledgeCheckHeight * 0.5f);

        if (!Physics.Raycast(origin, transform.forward, out RaycastHit forwardHit, probeDistance, traversalMask))
        {
            return false;
        }

        Vector3 downOrigin = forwardHit.point + transform.forward * 0.1f + Vector3.up * ledgeCheckHeight;
        if (!Physics.Raycast(downOrigin, Vector3.down, out RaycastHit downHit, ledgeCheckHeight + 0.5f, traversalMask))
        {
            return false;
        }

        ledgePoint = downHit.point;
        return true;
    }

    /// Begins a mantle onto a detected ledge, briefly taking over character control for a smooth hop-up.
    public void BeginMantle(Vector3 ledgePoint)
    {
        if (CurrentState != TraversalState.Grounded) return;
        StartCoroutine(MantleRoutine(ledgePoint));
    }

    private IEnumerator MantleRoutine(Vector3 ledgePoint)
    {
        CurrentState = TraversalState.Mantling;
        OnMantleStarted?.Invoke();
        controller.enabled = false;

        Vector3 start = transform.position;
        float elapsed = 0f;

        while (elapsed < mantleDuration)
        {
            elapsed += Time.deltaTime;
            float t = mantleCurve.Evaluate(Mathf.Clamp01(elapsed / mantleDuration));
            transform.position = Vector3.Lerp(start, ledgePoint, t);
            yield return null;
        }

        transform.position = ledgePoint;
        controller.enabled = true;
        CurrentState = TraversalState.Grounded;
        OnMantleCompleted?.Invoke();
    }

    /// Attaches the player to a zipline path defined by a series of transform waypoints and rides it to the end.
    public void AttachToZipline(Transform[] waypoints)
    {
        if (waypoints == null || waypoints.Length < 2 || CurrentState != TraversalState.Grounded) return;
        StartCoroutine(ZiplineRoutine(waypoints));
    }

    private IEnumerator ZiplineRoutine(Transform[] waypoints)
    {
        CurrentState = TraversalState.Ziplining;
        controller.enabled = false;
        OnZiplineAttached?.Invoke(waypoints[0]);

        for (int i = 0; i < waypoints.Length - 1; i++)
        {
            Vector3 segmentStart = waypoints[i].position;
            Vector3 segmentEnd = waypoints[i + 1].position;
            float segmentLength = Vector3.Distance(segmentStart, segmentEnd);
            float travelTime = segmentLength / ziplineSpeed;
            float elapsed = 0f;

            while (elapsed < travelTime)
            {
                elapsed += Time.deltaTime;
                transform.position = Vector3.Lerp(segmentStart, segmentEnd, elapsed / travelTime);
                yield return null;
            }
        }

        controller.enabled = true;
        CurrentState = TraversalState.Grounded;
        OnZiplineDetached?.Invoke();
    }
}
