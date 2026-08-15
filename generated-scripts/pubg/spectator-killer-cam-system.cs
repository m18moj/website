/*
 * ScripForge — Spectator & Killer-Cam System
 * Pack: PUBG Pack | Category: HUD
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Free-cam and killer-cam spectating modes for eliminated players, with target cycling and smooth follow.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using System;
using System.Collections.Generic;
using UnityEngine;

public enum SpectateMode { KillerCam, FreeCam, FollowCam }

/// Drives the camera an eliminated player sees: a brief killer-cam, then free-roam or follow-a-teammate cams.
public class SpectatorKillerCamSystem : MonoBehaviour
{
    [Header("References")]
    [SerializeField] private Camera spectatorCamera;
    [SerializeField] private List<Transform> spectatableTargets = new List<Transform>();

    [Header("Killer Cam")]
    [SerializeField] private float killerCamDuration = 4f;
    [SerializeField] private float killerCamDistance = 4f;
    [SerializeField] private float killerCamHeight = 1.5f;
    [SerializeField] private float killerCamOrbitSpeed = 8f;

    [Header("Free Cam")]
    [SerializeField] private float freeCamMoveSpeed = 12f;
    [SerializeField] private float freeCamLookSensitivity = 2.5f;

    [Header("Follow Cam")]
    [SerializeField] private float followDistance = 5f;
    [SerializeField] private float followHeight = 2f;
    [SerializeField] private float followSmoothTime = 0.2f;

    public SpectateMode CurrentMode { get; private set; } = SpectateMode.KillerCam;
    public event Action<SpectateMode> OnModeChanged;
    public event Action<Transform> OnTargetChanged;

    private Transform killerTransform;
    private float killerCamTimer;
    private float killerCamOrbitAngle;
    private int followIndex;
    private Vector3 followVelocity;
    private Vector2 freeCamLookInput;

    /// Called on local player death; killerTransform may be null if killed by the zone/environment.
    public void BeginSpectating(Transform killer)
    {
        killerTransform = killer;
        killerCamTimer = 0f;
        killerCamOrbitAngle = 0f;
        SetMode(killerTransform != null ? SpectateMode.KillerCam : SpectateMode.FreeCam);
    }

    private void Update()
    {
        switch (CurrentMode)
        {
            case SpectateMode.KillerCam:
                UpdateKillerCam();
                break;
            case SpectateMode.FreeCam:
                UpdateFreeCam();
                break;
            case SpectateMode.FollowCam:
                UpdateFollowCam();
                break;
        }
    }

    private void UpdateKillerCam()
    {
        if (killerTransform == null)
        {
            SetMode(SpectateMode.FreeCam);
            return;
        }

        killerCamTimer += Time.deltaTime;
        killerCamOrbitAngle += killerCamOrbitSpeed * Time.deltaTime;

        Vector3 offset = Quaternion.Euler(0f, killerCamOrbitAngle, 0f) * (Vector3.back * killerCamDistance + Vector3.up * killerCamHeight);
        spectatorCamera.transform.position = killerTransform.position + offset;
        spectatorCamera.transform.LookAt(killerTransform.position + Vector3.up * 1f);

        if (killerCamTimer >= killerCamDuration)
        {
            SetMode(spectatableTargets.Count > 0 ? SpectateMode.FollowCam : SpectateMode.FreeCam);
        }
    }

    private void UpdateFreeCam()
    {
        Vector3 move = new Vector3(freeCamLookInput.x, 0f, freeCamLookInput.y) * (freeCamMoveSpeed * Time.deltaTime);
        spectatorCamera.transform.Translate(move, Space.Self);
    }

    /// Feed raw look-axis input here (e.g. from your input system) while in free-cam mode.
    public void SetFreeCamLook(Vector2 lookDelta)
    {
        freeCamLookInput = lookDelta;
        Vector3 euler = spectatorCamera.transform.eulerAngles;
        euler.y += lookDelta.x * freeCamLookSensitivity;
        euler.x -= lookDelta.y * freeCamLookSensitivity;
        spectatorCamera.transform.eulerAngles = euler;
    }

    private void UpdateFollowCam()
    {
        if (spectatableTargets.Count == 0) return;
        Transform target = spectatableTargets[followIndex];
        if (target == null) return;

        Vector3 desired = target.position - target.forward * followDistance + Vector3.up * followHeight;
        spectatorCamera.transform.position = Vector3.SmoothDamp(spectatorCamera.transform.position, desired, ref followVelocity, followSmoothTime);
        spectatorCamera.transform.LookAt(target.position + Vector3.up * 1.2f);
    }

    /// Cycles to the next living teammate/target while in follow mode.
    public void CycleFollowTarget(int direction)
    {
        if (spectatableTargets.Count == 0) return;
        followIndex = (followIndex + direction + spectatableTargets.Count) % spectatableTargets.Count;
        OnTargetChanged?.Invoke(spectatableTargets[followIndex]);
    }

    public void SetMode(SpectateMode mode)
    {
        CurrentMode = mode;
        OnModeChanged?.Invoke(mode);
    }
}
