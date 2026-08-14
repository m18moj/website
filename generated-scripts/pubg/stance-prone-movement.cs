/*
 * ScriptForge — Stance & Prone Movement
 * Pack: PUBG Pack | Category: Movement
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Stand/crouch/prone stance switching that smoothly adjusts capsule height, move speed, and weapon accuracy.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using System;
using UnityEngine;

public enum Stance { Standing, Crouching, Prone }

[RequireComponent(typeof(CharacterController))]
public class StanceProneMovement : MonoBehaviour
{
    [Header("Capsule Heights")]
    [SerializeField] private float standingHeight = 1.8f;
    [SerializeField] private float crouchingHeight = 1.1f;
    [SerializeField] private float proneHeight = 0.5f;
    [SerializeField] private float heightTransitionSpeed = 6f;

    [Header("Movement Speed Multipliers")]
    [SerializeField] private float standingSpeedMultiplier = 1f;
    [SerializeField] private float crouchingSpeedMultiplier = 0.55f;
    [SerializeField] private float proneSpeedMultiplier = 0.25f;

    [Header("Accuracy Multipliers (lower = tighter spread)")]
    [SerializeField] private float standingSpreadMultiplier = 1f;
    [SerializeField] private float crouchingSpreadMultiplier = 0.65f;
    [SerializeField] private float proneSpreadMultiplier = 0.35f;

    [Header("Transition Rules")]
    [Tooltip("Standing-to-prone must pass through crouch to avoid teleport-style stance skips.")]
    [SerializeField] private bool requireCrouchBetweenStandAndProne = true;
    [SerializeField] private LayerMask obstructionMask = ~0;

    private CharacterController controller;
    private float targetHeight;
    private float currentHeightVelocity;

    public Stance CurrentStance { get; private set; } = Stance.Standing;
    public event Action<Stance> OnStanceChanged;

    private void Awake()
    {
        controller = GetComponent<CharacterController>();
        targetHeight = standingHeight;
        controller.height = standingHeight;
    }

    private void Update()
    {
        // Smoothly interpolate capsule height toward the target stance height.
        float newHeight = Mathf.SmoothDamp(controller.height, targetHeight, ref currentHeightVelocity, 1f / heightTransitionSpeed);
        float heightDelta = newHeight - controller.height;
        controller.height = newHeight;

        // Keep the character grounded by shifting the center as height changes.
        controller.center = new Vector3(0f, newHeight * 0.5f, 0f);
        transform.position += Vector3.up * (heightDelta * 0.5f);
    }

    /// Requests a stance change; blocked if there isn't enough overhead room to stand back up.
    public bool TrySetStance(Stance requested)
    {
        if (requested == CurrentStance) return true;

        if (requireCrouchBetweenStandAndProne && IsSkippingCrouch(CurrentStance, requested))
        {
            requested = Stance.Crouching;
        }

        if ((requested == Stance.Standing || requested == Stance.Crouching) && !HasHeadroomFor(requested))
        {
            return false; // Something is overhead — can't rise into it.
        }

        CurrentStance = requested;
        targetHeight = HeightForStance(requested);
        OnStanceChanged?.Invoke(CurrentStance);
        return true;
    }

    private bool IsSkippingCrouch(Stance from, Stance to)
    {
        return (from == Stance.Standing && to == Stance.Prone) || (from == Stance.Prone && to == Stance.Standing);
    }

    private bool HasHeadroomFor(Stance target)
    {
        float requiredHeight = HeightForStance(target);
        Vector3 origin = transform.position + Vector3.up * controller.height;
        float checkDistance = requiredHeight - controller.height;
        if (checkDistance <= 0f) return true;

        return !Physics.Raycast(origin, Vector3.up, checkDistance, obstructionMask);
    }

    private float HeightForStance(Stance stance)
    {
        switch (stance)
        {
            case Stance.Crouching: return crouchingHeight;
            case Stance.Prone: return proneHeight;
            default: return standingHeight;
        }
    }

    public float CurrentSpeedMultiplier => CurrentStance switch
    {
        Stance.Crouching => crouchingSpeedMultiplier,
        Stance.Prone => proneSpeedMultiplier,
        _ => standingSpeedMultiplier,
    };

    public float CurrentSpreadMultiplier => CurrentStance switch
    {
        Stance.Crouching => crouchingSpreadMultiplier,
        Stance.Prone => proneSpreadMultiplier,
        _ => standingSpreadMultiplier,
    };
}
