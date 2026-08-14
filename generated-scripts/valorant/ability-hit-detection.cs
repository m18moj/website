/*
 * ScriptForge — Ability Hit Reg & Status Effects
 * Pack: Valorant Pack | Category: Combat
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Hitbox-accurate ability collision with status effects (blind/slow/vulnerable) and stacking.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections;
using System.Collections.Generic;
using UnrealEngine;

namespace ScriptForge.Combat
{
    public enum StatusEffectType { Blind, Slow, Vulnerable, Suppress }

    [Serializable]
    public struct StatusEffectSpec
    {
        public StatusEffectType type;
        public float duration;
        [Tooltip("Slow: movement multiplier. Vulnerable: incoming damage multiplier. Ignored for Blind/Suppress.")]
        public float magnitude;
        [Tooltip("If true, re-applying refreshes duration instead of stacking a second instance.")]
        public bool refreshOnly;
    }

    /// <summary>
    /// Attach to a projectile or AoE trigger volume representing an ability effect. On overlap
    /// with a valid target it applies status effects via the target's StatusEffectReceiver.
    /// </summary>
    [RequireComponent(typeof(Collider))]
    public class AbilityHitDetector : MonoBehaviour
    {
        [Header("Targeting")]
        public LayerMask targetLayers;
        public string sourcePlayerId;

        [Header("Effects Applied On Hit")]
        public List<StatusEffectSpec> effectsToApply = new List<StatusEffectSpec>();

        [Header("Behaviour")]
        [Tooltip("If true, the collider disables itself after the first valid hit (grenade-style, single-use).")]
        public bool oneShot = true;

        private bool _consumed;

        private void OnTriggerEnter(Collider other)
        {
            if (_consumed) return;
            if ((targetLayers.value & (1 << other.gameObject.layer)) == 0) return;

            var receiver = other.GetComponentInParent<StatusEffectReceiver>();
            if (receiver == null) return;

            foreach (var effect in effectsToApply)
            {
                receiver.ApplyEffect(effect, sourcePlayerId);
            }

            if (oneShot)
            {
                _consumed = true;
                var col = GetComponent<Collider>();
                if (col != null) col.enabled = false;
            }
        }
    }

    /// <summary>
    /// Sits on a player/agent and tracks currently active status effects, handling stacking
    /// and refresh rules, and exposing aggregate multipliers for movement/damage systems to query.
    /// </summary>
    public class StatusEffectReceiver : MonoBehaviour
    {
        public event Action<StatusEffectType> OnEffectApplied;
        public event Action<StatusEffectType> OnEffectExpired;

        private class ActiveEffect
        {
            public StatusEffectSpec spec;
            public float remaining;
            public string sourcePlayerId;
        }

        private readonly List<ActiveEffect> _active = new List<ActiveEffect>();

        private void Update()
        {
            for (int i = _active.Count - 1; i >= 0; i--)
            {
                _active[i].remaining -= Time.deltaTime;
                if (_active[i].remaining <= 0f)
                {
                    var type = _active[i].spec.type;
                    _active.RemoveAt(i);
                    OnEffectExpired?.Invoke(type);
                }
            }
        }

        public void ApplyEffect(StatusEffectSpec spec, string sourcePlayerId)
        {
            if (spec.refreshOnly)
            {
                var existing = _active.Find(e => e.spec.type == spec.type);
                if (existing != null)
                {
                    existing.remaining = Mathf.Max(existing.remaining, spec.duration);
                    return;
                }
            }

            _active.Add(new ActiveEffect { spec = spec, remaining = spec.duration, sourcePlayerId = sourcePlayerId });
            OnEffectApplied?.Invoke(spec.type);
        }

        public bool HasEffect(StatusEffectType type) => _active.Exists(e => e.spec.type == type);

        /// <summary>Aggregate movement speed multiplier from all active Slow effects (stacking multiplicatively).</summary>
        public float GetMovementMultiplier()
        {
            float mult = 1f;
            foreach (var e in _active)
                if (e.spec.type == StatusEffectType.Slow)
                    mult *= Mathf.Clamp01(e.spec.magnitude);
            return mult;
        }

        /// <summary>Aggregate incoming-damage multiplier from all active Vulnerable effects.</summary>
        public float GetDamageTakenMultiplier()
        {
            float mult = 1f;
            foreach (var e in _active)
                if (e.spec.type == StatusEffectType.Vulnerable)
                    mult *= Mathf.Max(1f, e.spec.magnitude);
            return mult;
        }

        public bool IsBlinded => HasEffect(StatusEffectType.Blind);
        public bool IsSuppressed => HasEffect(StatusEffectType.Suppress);
    }
}
