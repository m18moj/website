/*
 * ScriptForge — Vehicle Driving & Fuel System
 * Pack: Fortnite Pack | Category: Vehicles
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Drivable car/boat physics controller with a consumable fuel tank and refuel support.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using UnityEngine;

namespace ScriptForge.Fortnite.Vehicles
{
    public enum VehicleSurfaceType
    {
        Land,
        Water
    }

    /// <summary>
    /// Generic drivable vehicle controller supporting both land (car) and water (boat)
    /// movement modes, with a fuel tank that depletes over time while driving and can
    /// be refilled from jerry cans or fuel pumps. Uses a Rigidbody for physics-based motion.
    /// </summary>
    [RequireComponent(typeof(Rigidbody))]
    public class VehicleDrivingFuelSystem : MonoBehaviour
    {
        [Header("Surface")]
        [SerializeField] private VehicleSurfaceType surfaceType = VehicleSurfaceType.Land;

        [Header("Driving")]
        [SerializeField] private float enginePower = 1200f;
        [SerializeField] private float turnTorque = 400f;
        [SerializeField] private float maxSpeed = 30f;
        [SerializeField] private float boatBuoyancyHeight = 0.2f;
        [SerializeField] private float waterDrag = 1.5f;

        [Header("Fuel")]
        [SerializeField] private float maxFuel = 100f;
        [SerializeField] private float currentFuel = 100f;
        [SerializeField] private float fuelConsumptionPerSecond = 2.5f;
        [SerializeField] private float idleFuelConsumption = 0.2f;

        [Header("Driver State")]
        [SerializeField] private bool hasDriver;

        private Rigidbody rb;
        private float throttleInput;
        private float steerInput;

        public float FuelPercent => maxFuel > 0f ? currentFuel / maxFuel : 0f;
        public bool HasFuel => currentFuel > 0f;
        public bool HasDriver => hasDriver;

        public delegate void FuelDepletedHandler();
        public event FuelDepletedHandler OnFuelDepleted;

        private void Awake()
        {
            rb = GetComponent<Rigidbody>();
            rb.centerOfMass = new Vector3(0f, -0.5f, 0f); // lower COM for stability
        }

        /// <summary>Assigns or removes a driver. Only a driven vehicle consumes fuel from input.</summary>
        public void SetDriver(bool driverPresent)
        {
            hasDriver = driverPresent;
            if (!driverPresent)
            {
                throttleInput = 0f;
                steerInput = 0f;
            }
        }

        /// <summary>Call from an input system each frame while the local player is driving.</summary>
        public void SetInput(float throttle, float steer)
        {
            throttleInput = Mathf.Clamp(throttle, -1f, 1f);
            steerInput = Mathf.Clamp(steer, -1f, 1f);
        }

        private void FixedUpdate()
        {
            if (surfaceType == VehicleSurfaceType.Water)
            {
                ApplyBuoyancy();
            }

            if (hasDriver && HasFuel)
            {
                Drive();
                ConsumeFuel(fuelConsumptionPerSecond * Mathf.Abs(throttleInput) * Time.fixedDeltaTime);
            }
            else if (hasDriver)
            {
                // Out of fuel: engine cuts out, vehicle coasts to a stop.
                ConsumeFuel(0f);
            }
            else
            {
                // Idle drain represents systems left running / minor leakage.
                ConsumeFuel(idleFuelConsumption * Time.fixedDeltaTime);
            }
        }

        private void Drive()
        {
            if (rb.linearVelocity.magnitude < maxSpeed)
            {
                Vector3 forwardForce = transform.forward * (throttleInput * enginePower * Time.fixedDeltaTime);
                rb.AddForce(forwardForce, ForceMode.Acceleration);
            }

            float speedFactor = Mathf.Clamp01(rb.linearVelocity.magnitude / maxSpeed);
            Vector3 turn = transform.up * (steerInput * turnTorque * speedFactor * Time.fixedDeltaTime);
            rb.AddTorque(turn, ForceMode.Acceleration);

            if (surfaceType == VehicleSurfaceType.Water)
            {
                rb.linearVelocity *= (1f - waterDrag * Time.fixedDeltaTime);
            }
        }

        private void ApplyBuoyancy()
        {
            // Extremely simple buoyancy: assumes water plane at world Y = 0.
            float depth = boatBuoyancyHeight - transform.position.y;
            if (depth > 0f)
            {
                rb.AddForce(Vector3.up * depth * 20f, ForceMode.Acceleration);
            }
        }

        private void ConsumeFuel(float amount)
        {
            if (amount <= 0f)
                return;

            bool wasAboveZero = currentFuel > 0f;
            currentFuel = Mathf.Max(0f, currentFuel - amount);

            if (wasAboveZero && currentFuel <= 0f)
            {
                OnFuelDepleted?.Invoke();
            }
        }

        /// <summary>Adds fuel from a jerry can or fuel pump interaction, clamped to tank capacity.</summary>
        public void Refuel(float amount)
        {
            currentFuel = Mathf.Min(maxFuel, currentFuel + amount);
        }
    }
}
