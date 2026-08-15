/*
 * ScripForge — Vehicle Physics & Fuel System
 * Pack: PUBG Pack | Category: Vehicles
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Terrain-based vehicle physics, fuel consumption, and noise-based enemy aggro triggered by horn use.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using UnrealEngine;

[RequireComponent(typeof(Rigidbody))]
public class VehicleSystem : MonoBehaviour
{
    [Header("Engine")]
    [SerializeField] private float enginePower = 1500f;
    [SerializeField] private float maxSpeed = 30f; // meters/second
    [SerializeField] private float turnTorque = 400f;

    [Header("Terrain Grip")]
    [Tooltip("Multiplies effective traction based on the terrain tag under the vehicle.")]
    [SerializeField] private float roadGrip = 1f;
    [SerializeField] private float offRoadGrip = 0.6f;
    [SerializeField] private float mudGrip = 0.35f;
    [SerializeField] private LayerMask groundLayers;

    [Header("Fuel")]
    [SerializeField] private float maxFuel = 100f;
    [SerializeField] private float currentFuel = 100f;
    [SerializeField] private float fuelConsumptionPerSecondAtFullThrottle = 2.5f;

    [Header("Horn / Noise Aggro")]
    [SerializeField] private float hornNoiseRadius = 120f;
    [SerializeField] private LayerMask aiListenerLayers;

    public event Action OnFuelEmpty;
    public event Action<Vector3, float> OnHornHonked; // position, radius

    private Rigidbody rb;
    private float currentThrottle;
    private float currentSteer;
    private string currentTerrainTag = "Road";

    private void Awake()
    {
        rb = GetComponent<Rigidbody>();
    }

    private void FixedUpdate()
    {
        UpdateTerrainGrip();

        if (currentFuel > 0f && Mathf.Abs(currentThrottle) > 0.01f)
        {
            ApplyDrive();
            ConsumeFuel();
        }

        ApplySteering();
    }

    /// Sets normalized throttle input (-1 reverse .. 1 forward). Called from a player or AI driver controller.
    public void SetThrottle(float throttle)
    {
        currentThrottle = Mathf.Clamp(throttle, -1f, 1f);
    }

    /// Sets normalized steering input (-1 left .. 1 right).
    public void SetSteer(float steer)
    {
        currentSteer = Mathf.Clamp(steer, -1f, 1f);
    }

    private void ApplyDrive()
    {
        float grip = GetCurrentGrip();
        float speedFraction = rb.linearVelocity.magnitude / maxSpeed;
        float availablePower = enginePower * grip * Mathf.Clamp01(1f - speedFraction);

        Vector3 force = transform.forward * (currentThrottle * availablePower);
        rb.AddForce(force, ForceMode.Force);
    }

    private void ApplySteering()
    {
        if (rb.linearVelocity.magnitude < 0.5f) return; // Avoid spinning in place when stationary.

        float grip = GetCurrentGrip();
        Vector3 torque = Vector3.up * (currentSteer * turnTorque * grip);
        rb.AddTorque(torque, ForceMode.Force);
    }

    private void ConsumeFuel()
    {
        float consumption = fuelConsumptionPerSecondAtFullThrottle * Mathf.Abs(currentThrottle) * Time.fixedDeltaTime;
        currentFuel = Mathf.Max(0f, currentFuel - consumption);

        if (currentFuel <= 0f)
        {
            OnFuelEmpty?.Invoke();
        }
    }

    /// Refuels the vehicle, e.g. from a jerry can item, clamped to the tank capacity.
    public void AddFuel(float amount)
    {
        currentFuel = Mathf.Min(maxFuel, currentFuel + amount);
    }

    private void UpdateTerrainGrip()
    {
        if (Physics.Raycast(transform.position + Vector3.up * 0.5f, Vector3.down, out RaycastHit hit, 2f, groundLayers))
        {
            currentTerrainTag = hit.collider.tag;
        }
    }

    private float GetCurrentGrip()
    {
        switch (currentTerrainTag)
        {
            case "Mud": return mudGrip;
            case "OffRoad": return offRoadGrip;
            default: return roadGrip;
        }
    }

    /// Honks the horn, emitting a noise event that nearby AI listeners can react to (e.g. investigate).
    public void HonkHorn()
    {
        OnHornHonked?.Invoke(transform.position, hornNoiseRadius);

        Collider[] listeners = Physics.OverlapSphere(transform.position, hornNoiseRadius, aiListenerLayers);
        foreach (var listener in listeners)
        {
            listener.SendMessageUpwards("OnHeardVehicleHorn", transform.position, SendMessageOptions.DontRequireReceiver);
        }
    }

    public float FuelFraction => currentFuel / maxFuel;
}
