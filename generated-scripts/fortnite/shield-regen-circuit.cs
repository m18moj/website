/*
 * ScriptForge — Shield Potion & Regen Logic
 * Pack: Fortnite Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Manages shield item stacking, overshield caps and timed consumption of shield-restore consumables.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections;
using UnrealEngine;

namespace ScriptForge.Fortnite.Systems
{
    [Serializable]
    public class ShieldConsumable
    {
        public string ItemId;
        public float ShieldRestoreAmount;
        public float ConsumeDuration;
        [Tooltip("If true, this item can push shield above the normal max (e.g. overshield).")]
        public bool AllowsOvershield;
        public float OvershieldCap = 150f;
    }

    public class ShieldRegenCircuit : MonoBehaviour
    {
        public event Action<float, float> OnShieldChanged; // (current, max)
        public event Action<ShieldConsumable> OnConsumeStarted;
        public event Action<ShieldConsumable> OnConsumeFinished;
        public event Action OnConsumeCancelled;

        [Header("Shield Settings")]
        [SerializeField] private float _maxShield = 100f;
        [SerializeField] private float _currentShield = 0f;

        [Header("Inventory")]
        [SerializeField] private int[] _stackCounts; // parallel to a consumable list held elsewhere
        [SerializeField] private ShieldConsumable[] _consumables;

        private Coroutine _consumeRoutine;
        private bool _isConsuming;

        public float CurrentShield => _currentShield;
        public float MaxShield => _maxShield;
        public bool IsConsuming => _isConsuming;

        private void Awake()
        {
            if (_stackCounts == null || _stackCounts.Length != _consumables.Length)
            {
                _stackCounts = new int[_consumables.Length];
            }
        }

        // Begins consuming the shield item at the given inventory index, unless already at cap or busy.
        public bool TryConsume(int itemIndex)
        {
            if (_isConsuming) return false;
            if (itemIndex < 0 || itemIndex >= _consumables.Length) return false;
            if (_stackCounts[itemIndex] <= 0) return false;

            ShieldConsumable item = _consumables[itemIndex];
            float effectiveCap = item.AllowsOvershield ? item.OvershieldCap : _maxShield;

            if (_currentShield >= effectiveCap) return false;

            _consumeRoutine = StartCoroutine(ConsumeRoutine(itemIndex, item));
            return true;
        }

        private IEnumerator ConsumeRoutine(int itemIndex, ShieldConsumable item)
        {
            _isConsuming = true;
            OnConsumeStarted?.Invoke(item);

            float elapsed = 0f;
            while (elapsed < item.ConsumeDuration)
            {
                elapsed += Time.deltaTime;
                yield return null;
            }

            ApplyShieldRestore(item);
            _stackCounts[itemIndex] = Mathf.Max(0, _stackCounts[itemIndex] - 1);

            _isConsuming = false;
            OnConsumeFinished?.Invoke(item);
            _consumeRoutine = null;
        }

        // Cancels an in-progress consume (e.g. player takes damage or moves during a channel).
        public void CancelConsume()
        {
            if (!_isConsuming) return;

            if (_consumeRoutine != null)
            {
                StopCoroutine(_consumeRoutine);
                _consumeRoutine = null;
            }

            _isConsuming = false;
            OnConsumeCancelled?.Invoke();
        }

        private void ApplyShieldRestore(ShieldConsumable item)
        {
            float cap = item.AllowsOvershield ? item.OvershieldCap : _maxShield;
            _currentShield = Mathf.Min(cap, _currentShield + item.ShieldRestoreAmount);
            OnShieldChanged?.Invoke(_currentShield, cap);
        }

        // Applies incoming damage to shield first, returning any leftover damage that should hit health.
        public float AbsorbDamage(float incomingDamage)
        {
            if (_currentShield <= 0f) return incomingDamage;

            float absorbed = Mathf.Min(_currentShield, incomingDamage);
            _currentShield -= absorbed;
            OnShieldChanged?.Invoke(_currentShield, _maxShield);

            return incomingDamage - absorbed;
        }

        public void AddStack(int itemIndex, int amount)
        {
            if (itemIndex < 0 || itemIndex >= _stackCounts.Length) return;
            _stackCounts[itemIndex] += amount;
        }
    }
}
