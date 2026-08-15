/*
 * ScripForge — Emote & Bounce Pad System
 * Pack: Fortnite Pack | Category: Movement
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Emote-wheel playback locking player input, plus launch-pad/bounce-pad physics with cooldown and trajectory arc.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections;
using System.Collections.Generic;
using UnrealEngine;

namespace ScripForge.Fortnite.Movement
{
    [Serializable]
    public class EmoteDefinition
    {
        public string EmoteId;
        public AnimationClip Clip;
        public float Duration = 3f;
        public bool CancellableByMovement = true;
    }

    [RequireComponent(typeof(Animator))]
    public class BoogieBounceController : MonoBehaviour
    {
        public event Action<EmoteDefinition> OnEmoteStarted;
        public event Action OnEmoteEnded;
        public event Action<Vector3> OnBouncePadTriggered;

        [Header("Emote Wheel")]
        [SerializeField] private List<EmoteDefinition> _emoteLibrary = new List<EmoteDefinition>();
        [SerializeField] private Animator _animator;
        [SerializeField] private CharacterController _controller;

        private bool _isEmoting;
        private Coroutine _emoteRoutine;

        public bool IsEmoting => _isEmoting;

        private void Awake()
        {
            if (_animator == null) _animator = GetComponent<Animator>();
            if (_controller == null) _controller = GetComponent<CharacterController>();
        }

        private void Update()
        {
            // Movement input cancels a cancellable emote early, mirroring typical BR emote UX.
            if (_isEmoting && HasMovementInput())
            {
                TryCancelEmote();
            }
        }

        public void PlayEmote(string emoteId)
        {
            if (_isEmoting) return;

            EmoteDefinition def = _emoteLibrary.Find(e => e.EmoteId == emoteId);
            if (def == null) return;

            _emoteRoutine = StartCoroutine(EmoteRoutine(def));
        }

        private IEnumerator EmoteRoutine(EmoteDefinition def)
        {
            _isEmoting = true;
            OnEmoteStarted?.Invoke(def);

            if (def.Clip != null && _animator != null)
            {
                _animator.CrossFade(def.Clip.name, 0.15f);
            }

            yield return new WaitForSeconds(def.Duration);

            _isEmoting = false;
            OnEmoteEnded?.Invoke();
            _emoteRoutine = null;
        }

        private void TryCancelEmote()
        {
            if (_emoteRoutine != null)
            {
                StopCoroutine(_emoteRoutine);
                _emoteRoutine = null;
            }

            _isEmoting = false;
            OnEmoteEnded?.Invoke();
        }

        private bool HasMovementInput()
        {
            return Mathf.Abs(Input.GetAxisRaw("Horizontal")) > 0.1f || Mathf.Abs(Input.GetAxisRaw("Vertical")) > 0.1f;
        }
    }

    // Placed on a launch/bounce pad in the level; applies an impulse velocity to anything that steps on it.
    [RequireComponent(typeof(Collider))]
    public class BouncePad : MonoBehaviour
    {
        [Header("Launch Settings")]
        [SerializeField] private Vector3 _launchDirection = Vector3.up;
        [SerializeField] private float _launchForce = 25f;
        [SerializeField] private float _cooldown = 0.5f;
        [SerializeField] private LayerMask _affectedLayers;

        private float _lastTriggerTime = -999f;

        private void OnTriggerEnter(Collider other)
        {
            if (Time.time - _lastTriggerTime < _cooldown) return;
            if (((1 << other.gameObject.layer) & _affectedLayers) == 0) return;

            CharacterController cc = other.GetComponent<CharacterController>();
            IBouncable bouncable = other.GetComponent<IBouncable>();

            Vector3 worldDirection = transform.TransformDirection(_launchDirection.normalized);
            Vector3 impulse = worldDirection * _launchForce;

            if (bouncable != null)
            {
                bouncable.ApplyLaunch(impulse);
            }

            _lastTriggerTime = Time.time;
        }
    }

    public interface IBouncable
    {
        void ApplyLaunch(Vector3 impulseVelocity);
    }
}
