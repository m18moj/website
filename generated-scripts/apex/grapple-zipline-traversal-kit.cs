/*
 * ScripForge — Grapple & Zipline Traversal Kit
 * Pack: Apex Legends Pack | Category: Movement
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Directional grapple-hook swings and zipline mounting with a fall-damage cancel window on landing.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using UnrealEngine;

public enum TraversalState { Grounded, Grappling, OnZipline, Falling }

[RequireComponent(typeof(CharacterController))]
public class GrappleZiplineTraversalKit : MonoBehaviour
{
    [Header("Grapple Tuning")]
    [SerializeField] private float grappleMaxRange = 45f;
    [SerializeField] private float grapplePullForce = 30f;
    [SerializeField] private float grappleMinSwingSpeed = 8f;
    [SerializeField] private LayerMask grappleSurfaceMask;

    [Header("Zipline Tuning")]
    [SerializeField] private float ziplineSpeed = 18f;
    [SerializeField] private float ziplineMountRadius = 3f;

    [Header("Fall Damage Cancel")]
    [Tooltip("Landing within this many seconds of releasing a grapple or zipline negates fall damage entirely.")]
    [SerializeField] private float fallDamageCancelWindow = 0.35f;
    [SerializeField] private float fallDamagePerMeter = 2.5f;
    [SerializeField] private float fallDamageMinHeight = 6f;

    private CharacterController controller;
    private Vector3 grapplePoint;
    private Vector3 ziplineDirection;
    private float releaseTimer = -1f;
    private float fallStartHeight;
    private bool wasGroundedLastFrame = true;

    public TraversalState State { get; private set; } = TraversalState.Grounded;

    public event System.Action OnGrappleAttached;
    public event System.Action OnGrappleReleased;
    public event System.Action OnZiplineMounted;
    public event System.Action OnZiplineDismounted;
    public event System.Action<float> OnFallDamageApplied;
    public event System.Action OnFallDamageCancelled;

    private void Awake()
    {
        controller = GetComponent<CharacterController>();
    }

    private void Update()
    {
        switch (State)
        {
            case TraversalState.Grappling:
                UpdateGrappleSwing();
                break;
            case TraversalState.OnZipline:
                UpdateZiplineRide();
                break;
            case TraversalState.Falling:
            case TraversalState.Grounded:
                UpdateFallTracking();
                break;
        }

        if (releaseTimer >= 0f)
        {
            releaseTimer += Time.deltaTime;
        }
    }

    /// Fires a grapple toward the aim direction; call from an input handler with a raycast hit against grappleSurfaceMask.
    public bool TryFireGrapple(Vector3 hitPoint, bool hitValidSurface)
    {
        if (State != TraversalState.Grounded && State != TraversalState.Falling) return false;
        if (!hitValidSurface || Vector3.Distance(transform.position, hitPoint) > grappleMaxRange) return false;

        grapplePoint = hitPoint;
        State = TraversalState.Grappling;
        OnGrappleAttached?.Invoke();
        return true;
    }

    private void UpdateGrappleSwing()
    {
        Vector3 toPoint = grapplePoint - transform.position;
        Vector3 pull = toPoint.normalized * grapplePullForce * Time.deltaTime;
        controller.Move(pull);

        // Once the player has enough swing momentum built up, releasing early feels better than auto-detaching at the anchor.
        if (toPoint.magnitude < 1.5f || controller.velocity.magnitude < grappleMinSwingSpeed * 0.25f)
        {
            ReleaseGrapple();
        }
    }

    /// Manually releases the active grapple, e.g. on jump input while swinging.
    public void ReleaseGrapple()
    {
        if (State != TraversalState.Grappling) return;

        State = TraversalState.Falling;
        fallStartHeight = transform.position.y;
        releaseTimer = 0f;
        OnGrappleReleased?.Invoke();
    }

    /// Call when the player enters a zipline mount trigger within ziplineMountRadius of an anchor.
    public bool TryMountZipline(Vector3 anchorPoint, Vector3 travelDirection)
    {
        if (State != TraversalState.Grounded && State != TraversalState.Falling) return false;
        if (Vector3.Distance(transform.position, anchorPoint) > ziplineMountRadius) return false;

        ziplineDirection = travelDirection.normalized;
        State = TraversalState.OnZipline;
        OnZiplineMounted?.Invoke();
        return true;
    }

    private void UpdateZiplineRide()
    {
        controller.Move(ziplineDirection * ziplineSpeed * Time.deltaTime);
    }

    /// Dismounts the zipline early, e.g. on jump input, dropping the player into a fall-damage-cancel-eligible state.
    public void DismountZipline()
    {
        if (State != TraversalState.OnZipline) return;

        State = TraversalState.Falling;
        fallStartHeight = transform.position.y;
        releaseTimer = 0f;
        OnZiplineDismounted?.Invoke();
    }

    private void UpdateFallTracking()
    {
        bool grounded = controller.isGrounded;

        if (!grounded && State == TraversalState.Grounded)
        {
            State = TraversalState.Falling;
            fallStartHeight = transform.position.y;
        }
        else if (grounded && !wasGroundedLastFrame)
        {
            ResolveLanding();
        }

        wasGroundedLastFrame = grounded;
    }

    private void ResolveLanding()
    {
        float dropHeight = fallStartHeight - transform.position.y;
        bool withinCancelWindow = releaseTimer >= 0f && releaseTimer <= fallDamageCancelWindow;

        if (withinCancelWindow)
        {
            OnFallDamageCancelled?.Invoke();
        }
        else if (dropHeight > fallDamageMinHeight)
        {
            float damage = (dropHeight - fallDamageMinHeight) * fallDamagePerMeter;
            OnFallDamageApplied?.Invoke(damage);
        }

        releaseTimer = -1f;
        State = TraversalState.Grounded;
    }
}
