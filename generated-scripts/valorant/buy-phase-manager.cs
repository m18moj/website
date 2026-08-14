/*
 * ScriptForge — Buy Phase & Economy System
 * Pack: Valorant Pack | Category: Economy
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Round-start buy menu with credit rewards, loss-bonus economy, per-side loadout saving.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections;
using System.Collections.Generic;
using UnrealEngine;

namespace ScriptForge.Economy
{
    public enum RoundResult { Win, Loss }

    [Serializable]
    public class Loadout
    {
        public string primaryWeaponId = "";
        public string secondaryWeaponId = "classic";
        public bool hasArmor;
        public bool hasHeavyArmor;
        public List<string> purchasedAbilityIds = new List<string>();
    }

    /// <summary>
    /// Manages the round-start buy window, credit awards, the loss-bonus ladder, and
    /// remembers each player's last loadout per side (attack/defense) for quick re-buy.
    /// </summary>
    public class BuyPhaseManager : MonoBehaviour
    {
        [Header("Timing")]
        [Tooltip("Seconds the buy phase remains open after round start.")]
        public float buyPhaseDuration = 30f;

        [Header("Economy Rules")]
        public int startingCredits = 800;
        public int maxCredits = 9000;
        public int roundWinReward = 3000;
        public int killReward = 200;
        public int spikePlantReward = 300;
        public int[] lossBonusLadder = { 1900, 2400, 2900, 3400 };

        public bool IsBuyPhaseOpen { get; private set; }
        public float TimeRemaining { get; private set; }

        public event Action OnBuyPhaseOpened;
        public event Action OnBuyPhaseClosed;
        public event Action<int> OnCreditsChanged;

        private int _credits;
        private int _consecutiveLosses;
        private readonly Dictionary<string, Loadout> _savedLoadouts = new Dictionary<string, Loadout>
        {
            { "attack", new Loadout() },
            { "defense", new Loadout() }
        };

        private Coroutine _phaseRoutine;

        private void Awake()
        {
            _credits = startingCredits;
        }

        /// <summary>Call at the start of every round.</summary>
        public void BeginRound()
        {
            if (_phaseRoutine != null) StopCoroutine(_phaseRoutine);
            _phaseRoutine = StartCoroutine(RunBuyPhase());
        }

        private IEnumerator RunBuyPhase()
        {
            IsBuyPhaseOpen = true;
            TimeRemaining = buyPhaseDuration;
            OnBuyPhaseOpened?.Invoke();

            while (TimeRemaining > 0f)
            {
                TimeRemaining -= Time.deltaTime;
                yield return null;
            }

            IsBuyPhaseOpen = false;
            OnBuyPhaseClosed?.Invoke();
        }

        /// <summary>Attempts to spend credits on an item; fails outside the buy phase or if funds are short.</summary>
        public bool TryPurchase(int cost)
        {
            if (!IsBuyPhaseOpen) return false;
            if (_credits < cost) return false;

            SetCredits(_credits - cost);
            return true;
        }

        public void AddCredits(int amount)
        {
            SetCredits(_credits + amount);
        }

        /// <summary>Call once the round outcome is known to apply win reward or loss-bonus ladder progression.</summary>
        public void ApplyRoundResultEconomy(RoundResult result)
        {
            if (result == RoundResult.Win)
            {
                AddCredits(roundWinReward);
                _consecutiveLosses = 0;
            }
            else
            {
                int ladderIndex = Mathf.Clamp(_consecutiveLosses, 0, lossBonusLadder.Length - 1);
                AddCredits(lossBonusLadder[ladderIndex]);
                _consecutiveLosses = Mathf.Min(_consecutiveLosses + 1, lossBonusLadder.Length - 1);
            }
        }

        public void RegisterKill() => AddCredits(killReward);
        public void RegisterSpikePlant() => AddCredits(spikePlantReward);

        /// <summary>Persists the player's current loadout choice for the given side for fast re-buy next round.</summary>
        public void SaveLoadout(string side, Loadout loadout)
        {
            _savedLoadouts[side] = loadout;
        }

        public Loadout GetSavedLoadout(string side)
        {
            return _savedLoadouts.TryGetValue(side, out var l) ? l : new Loadout();
        }

        private void SetCredits(int value)
        {
            _credits = Mathf.Clamp(value, 0, maxCredits);
            OnCreditsChanged?.Invoke(_credits);
        }

        public int GetCredits() => _credits;
    }
}
