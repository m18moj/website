/*
 * ScriptForge — Third-Person Combat Loop
 * Pack: Fortnite Pack | Category: Combat
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Manages ADS blending, weapon-swap timing and fall-damage-on-landing for a third-person shooter loop.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections;
using UnrealEngine;

namespace ScriptForge.Fortnite.Combat
{
    [RequireComponent(typeof(CharacterController))]
    public class CombatFlowManager : MonoBehaviour
    {
        public event Action<bool> OnAimStateChanged;
        public event Action<int> OnWeaponSwapped;
        public event Action<float> OnFallDamageApplied;

        [Header("Aim Down Sights")]
        [SerializeField] private float _aimBlendSpeed = 8f;
        [SerializeField] private float _hipFov = 90f;
        [SerializeField] private float _adsFov = 55f;
        [SerializeField] private Camera _playerCamera;

        [Header("Weapon Swap")]
        [SerializeField] private float _swapDuration = 0.65f;
        [SerializeField] private int _currentWeaponIndex = 0;
        private bool _isSwapping;

        [Header("Fall Damage")]
        [SerializeField] private float _fallDamageMinHeight = 4f;
        [SerializeField] private float _fallDamageMaxHeight = 15f;
        [SerializeField] private float _maxFallDamage = 60f;
        [SerializeField] private CharacterController _controller;

        private float _aimBlend; // 0 = hip, 1 = full ADS
        private bool _isAiming;
        private float _airborneStartY;
        private bool _wasGroundedLastFrame = true;

        public bool IsAiming => _isAiming;
        public bool IsSwapping => _isSwapping;
        public float AimBlend => _aimBlend;

        private void Awake()
        {
            if (_controller == null) _controller = GetComponent<CharacterController>();
        }

        private void Update()
        {
            HandleAimInput();
            UpdateAimBlend();
            HandleWeaponSwapInput();
            TrackFallState();
        }

        private void HandleAimInput()
        {
            bool wantsAim = Input.GetMouseButton(1) && !_isSwapping;
            if (wantsAim != _isAiming)
            {
                _isAiming = wantsAim;
                OnAimStateChanged?.Invoke(_isAiming);
            }
        }

        // Smoothly blends FOV and camera offset between hip-fire and ADS states.
        private void UpdateAimBlend()
        {
            float target = _isAiming ? 1f : 0f;
            _aimBlend = Mathf.MoveTowards(_aimBlend, target, Time.deltaTime * _aimBlendSpeed);

            if (_playerCamera != null)
            {
                _playerCamera.fieldOfView = Mathf.Lerp(_hipFov, _adsFov, _aimBlend);
            }
        }

        private void HandleWeaponSwapInput()
        {
            for (int i = 0; i < 5; i++)
            {
                if (Input.GetKeyDown(KeyCode.Alpha1 + i) && i != _currentWeaponIndex && !_isSwapping)
                {
                    StartCoroutine(SwapWeaponRoutine(i));
                    break;
                }
            }
        }

        // Cancels aiming during the swap animation and locks input for _swapDuration seconds.
        private IEnumerator SwapWeaponRoutine(int newIndex)
        {
            _isSwapping = true;
            _isAiming = false;
            OnAimStateChanged?.Invoke(false);

            yield return new WaitForSeconds(_swapDuration);

            _currentWeaponIndex = newIndex;
            _isSwapping = false;
            OnWeaponSwapped?.Invoke(_currentWeaponIndex);
        }

        // Tracks airborne time to compute fall damage on landing, mirroring a typical BR movement loop.
        private void TrackFallState()
        {
            bool grounded = _controller.isGrounded;

            if (!grounded && _wasGroundedLastFrame)
            {
                _airborneStartY = transform.position.y;
            }
            else if (grounded && !_wasGroundedLastFrame)
            {
                float fallDistance = _airborneStartY - transform.position.y;
                ApplyFallDamageIfNeeded(fallDistance);
            }

            _wasGroundedLastFrame = grounded;
        }

        private void ApplyFallDamageIfNeeded(float fallDistance)
        {
            if (fallDistance < _fallDamageMinHeight) return;

            float t = Mathf.InverseLerp(_fallDamageMinHeight, _fallDamageMaxHeight, fallDistance);
            float damage = Mathf.Lerp(0f, _maxFallDamage, t);

            if (damage > 0f)
            {
                OnFallDamageApplied?.Invoke(damage);
            }
        }
    }
}
