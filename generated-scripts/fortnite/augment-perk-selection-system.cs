/*
 * ScripForge — Augment Perk Selection System
 * Pack: Fortnite Pack | Category: Progression
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * A combat/utility augment slot offering a randomized choice-of-two selection on a timed cooldown.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections;
using System.Collections.Generic;
using UnrealEngine;

namespace ScripForge.Fortnite.Progression
{
    public enum AugmentSlotType
    {
        Combat,
        Utility
    }

    [Serializable]
    public class AugmentDefinition
    {
        public string AugmentId;
        public string DisplayName;
        public AugmentSlotType SlotType;
        [TextArea] public string Description;
        public int Weight = 1;
    }

    /// <summary>
    /// Drives a single augment slot (combat or utility). On cooldown expiry, offers the
    /// player a randomized choice of two augments drawn from the slot's weighted pool;
    /// selecting one applies it immediately and starts the next cooldown.
    /// </summary>
    public class AugmentSlotController : MonoBehaviour
    {
        public event Action<AugmentDefinition, AugmentDefinition> OnChoicePresented;
        public event Action<AugmentDefinition> OnAugmentSelected;
        public event Action OnCooldownStarted;

        [Header("Slot Setup")]
        [SerializeField] private AugmentSlotType _slotType;
        [SerializeField] private List<AugmentDefinition> _pool = new List<AugmentDefinition>();

        [Header("Timing")]
        [SerializeField] private float _cooldownSeconds = 300f;
        [SerializeField] private float _initialDelaySeconds = 30f;

        private AugmentDefinition _currentAugment;
        private AugmentDefinition _pendingOptionA;
        private AugmentDefinition _pendingOptionB;
        private bool _choicePending;
        private float _nextRollTime;
        private System.Random _rng = new System.Random();

        public AugmentDefinition CurrentAugment => _currentAugment;
        public bool HasChoicePending => _choicePending;
        public float SecondsUntilNextRoll => Mathf.Max(0f, _nextRollTime - Time.time);

        private void OnEnable()
        {
            _nextRollTime = Time.time + _initialDelaySeconds;
            StartCoroutine(CooldownWatcher());
        }

        private IEnumerator CooldownWatcher()
        {
            while (true)
            {
                if (!_choicePending && Time.time >= _nextRollTime)
                {
                    RollChoice();
                }
                yield return null;
            }
        }

        private void RollChoice()
        {
            var candidates = new List<AugmentDefinition>();
            foreach (var def in _pool)
            {
                if (def.SlotType == _slotType)
                    candidates.Add(def);
            }

            if (candidates.Count < 2) return;

            _pendingOptionA = WeightedPick(candidates, null);
            _pendingOptionB = WeightedPick(candidates, _pendingOptionA);

            if (_pendingOptionB == null)
            {
                // Fallback: pool too small to avoid a duplicate, just pick any second entry.
                foreach (var candidate in candidates)
                {
                    if (candidate != _pendingOptionA)
                    {
                        _pendingOptionB = candidate;
                        break;
                    }
                }
            }

            _choicePending = true;
            OnChoicePresented?.Invoke(_pendingOptionA, _pendingOptionB);
        }

        private AugmentDefinition WeightedPick(List<AugmentDefinition> candidates, AugmentDefinition exclude)
        {
            int totalWeight = 0;
            foreach (var def in candidates)
            {
                if (def == exclude) continue;
                totalWeight += Mathf.Max(1, def.Weight);
            }

            if (totalWeight <= 0) return null;

            int roll = _rng.Next(0, totalWeight);
            int cumulative = 0;

            foreach (var def in candidates)
            {
                if (def == exclude) continue;
                cumulative += Mathf.Max(1, def.Weight);
                if (roll < cumulative)
                    return def;
            }

            return null;
        }

        /// <summary>Selects option A or B from the currently pending choice.</summary>
        public bool SelectOption(bool pickOptionA)
        {
            if (!_choicePending) return false;

            AugmentDefinition chosen = pickOptionA ? _pendingOptionA : _pendingOptionB;
            _currentAugment = chosen;
            _choicePending = false;
            _pendingOptionA = null;
            _pendingOptionB = null;

            OnAugmentSelected?.Invoke(chosen);

            _nextRollTime = Time.time + _cooldownSeconds;
            OnCooldownStarted?.Invoke();
            return true;
        }
    }
}
