/*
 * ScriptForge — Vehicle Handling & Mounted Weapons
 * Pack: Call of Duty Pack | Category: Vehicles
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Drivable vehicle physics with throttle/steer handling and a rotating mounted-weapon seat.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using System;
using UnityEngine;

namespace ScriptForge.Vehicles
{
    /// <summary>
    /// Simple arcade-style rigidbody vehicle controller with a separate mounted-weapon seat
    /// that a passenger can rotate and fire independently of the driver's heading.
    /// Requires a Rigidbody on the same GameObject.
    /// </summary>
    [RequireComponent(typeof(Rigidbody))]
    public class VehicleHandlingMountedWeapons : MonoBehaviour
    {
        [Header("Driving")]
        [SerializeField] private float enginePower = 3000f;
        [SerializeField] private float maxSpeed = 30f;
        [SerializeField] private float steerTorque = 800f;
        [SerializeField] private float brakeForce = 4000f;
        [SerializeField] private Vector3 centerOfMassOffset = new Vector3(0f, -0.5f, 0f);

        [Header("Mounted Weapon")]
        [SerializeField] private Transform weaponPivot;
        [SerializeField] private float weaponTurnSpeed = 90f;
        [SerializeField] private float weaponMinPitch = -20f;
        [SerializeField] private float weaponMaxPitch = 45f;
        [SerializeField] private float fireRate = 8f;
        [SerializeField] private float weaponDamage = 18f;
        [SerializeField] private float weaponRange = 150f;
        [SerializeField] private LayerMask hitMask = ~0;

        private Rigidbody _rb;
        private float _throttleInput;
        private float _steerInput;
        private bool _brakeInput;
        private float _weaponYaw;
        private float _weaponPitch;
        private float _fireTimer;
        private bool _isOccupiedByDriver;
        private bool _isOccupiedByGunner;

        public event Action<RaycastHit> OnMountedWeaponHit;

        private void Awake()
        {
            _rb = GetComponent<Rigidbody>();
            _rb.centerOfMass += centerOfMassOffset;
        }

        /// <summary>Driver input, values expected in [-1, 1]. Call from your input layer each frame.</summary>
        public void SetDriveInput(float throttle, float steer, bool brake)
        {
            _throttleInput = Mathf.Clamp(throttle, -1f, 1f);
            _steerInput = Mathf.Clamp(steer, -1f, 1f);
            _brakeInput = brake;
        }

        /// <summary>Gunner input for rotating the mounted weapon, in degrees/sec deltas.</summary>
        public void SetWeaponAimInput(float yawDelta, float pitchDelta)
        {
            _weaponYaw += yawDelta * weaponTurnSpeed * Time.deltaTime;
            _weaponPitch = Mathf.Clamp(_weaponPitch + pitchDelta * weaponTurnSpeed * Time.deltaTime, weaponMinPitch, weaponMaxPitch);

            if (weaponPivot != null)
            {
                weaponPivot.localRotation = Quaternion.Euler(_weaponPitch, _weaponYaw, 0f);
            }
        }

        public void SetSeatOccupancy(bool driverPresent, bool gunnerPresent)
        {
            _isOccupiedByDriver = driverPresent;
            _isOccupiedByGunner = gunnerPresent;
            if (!driverPresent) _throttleInput = _steerInput = 0f;
        }

        private void FixedUpdate()
        {
            if (!_isOccupiedByDriver) return;

            float currentForwardSpeed = Vector3.Dot(_rb.linearVelocity, transform.forward);

            if (Mathf.Abs(currentForwardSpeed) < maxSpeed)
            {
                _rb.AddForce(transform.forward * (_throttleInput * enginePower), ForceMode.Force);
            }

            if (_brakeInput)
            {
                _rb.linearVelocity = Vector3.Lerp(_rb.linearVelocity, Vector3.zero, brakeForce * Time.fixedDeltaTime / Mathf.Max(1f, _rb.mass));
            }

            // Scale steering authority down at low speed to avoid spinning in place.
            float speedFactor = Mathf.Clamp01(Mathf.Abs(currentForwardSpeed) / 5f);
            _rb.AddTorque(Vector3.up * (_steerInput * steerTorque * speedFactor), ForceMode.Force);
        }

        /// <summary>Called by the gunner's fire input; raycasts from the weapon pivot on a fixed cadence.</summary>
        public void TryFireMountedWeapon()
        {
            if (!_isOccupiedByGunner || weaponPivot == null) return;
            if (_fireTimer > 0f) return;

            _fireTimer = 1f / Mathf.Max(0.01f, fireRate);

            if (Physics.Raycast(weaponPivot.position, weaponPivot.forward, out var hit, weaponRange, hitMask))
            {
                var damageable = hit.collider.GetComponentInParent<IDamageable>();
                damageable?.ApplyDamage(weaponDamage);
                OnMountedWeaponHit?.Invoke(hit);
            }
        }

        private void Update()
        {
            if (_fireTimer > 0f) _fireTimer -= Time.deltaTime;
        }
    }

    /// <summary>Minimal damage contract so this file compiles standalone; implement on your damageable actors.</summary>
    public interface IDamageable
    {
        void ApplyDamage(float amount);
    }
}
