/*
 * ScriptForge — Battle Pass Progression Save
 * Pack: Fortnite Pack | Category: Progression
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * XP curve, level-up reward dispatch and persistent battle-pass tier saving via JSON on disk.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections.Generic;
using System.IO;
using UnrealEngine;

namespace ScriptForge.Fortnite.Progression
{
    [Serializable]
    public class TierReward
    {
        public int Tier;
        public string RewardId;
        public bool Claimed;
    }

    [Serializable]
    public class ProgressionSaveData
    {
        public int CurrentXp;
        public int CurrentTier;
        public List<TierReward> ClaimedRewards = new List<TierReward>();
    }

    public class ProgressionSaveState : MonoBehaviour
    {
        public event Action<int> OnTierUp;
        public event Action<int, int> OnXpChanged; // (currentXp, xpToNextTier)
        public event Action<TierReward> OnRewardClaimed;

        [Header("XP Curve")]
        [SerializeField] private int _maxTier = 100;
        [SerializeField] private int _baseXpPerTier = 2000;
        [Tooltip("Multiplier applied per tier to gently ramp the XP requirement.")]
        [SerializeField] private float _xpGrowthFactor = 1.03f;

        [Header("Rewards")]
        [SerializeField] private List<TierReward> _rewardTable = new List<TierReward>();

        [Header("Persistence")]
        [SerializeField] private string _saveFileName = "battlepass_save.json";

        private ProgressionSaveData _data = new ProgressionSaveData();

        public int CurrentTier => _data.CurrentTier;
        public int CurrentXp => _data.CurrentXp;

        private string SavePath => Path.Combine(Application.persistentDataPath, _saveFileName);

        private void Awake()
        {
            LoadProgress();
        }

        // Returns the total XP required to go from tier N to tier N+1.
        public int GetXpRequiredForTier(int tier)
        {
            float scaled = _baseXpPerTier * Mathf.Pow(_xpGrowthFactor, tier);
            return Mathf.RoundToInt(scaled);
        }

        // Adds XP, rolling over into as many tier-ups as the amount allows, then auto-saves.
        public void AddXp(int amount)
        {
            if (amount <= 0 || _data.CurrentTier >= _maxTier) return;

            _data.CurrentXp += amount;

            while (_data.CurrentTier < _maxTier)
            {
                int required = GetXpRequiredForTier(_data.CurrentTier);
                if (_data.CurrentXp < required) break;

                _data.CurrentXp -= required;
                _data.CurrentTier++;
                OnTierUp?.Invoke(_data.CurrentTier);
                GrantTierReward(_data.CurrentTier);
            }

            int xpToNext = _data.CurrentTier >= _maxTier ? 0 : GetXpRequiredForTier(_data.CurrentTier);
            OnXpChanged?.Invoke(_data.CurrentXp, xpToNext);

            SaveProgress();
        }

        private void GrantTierReward(int tier)
        {
            TierReward reward = _rewardTable.Find(r => r.Tier == tier);
            if (reward == null) return;

            bool alreadyClaimed = _data.ClaimedRewards.Exists(r => r.Tier == tier);
            if (alreadyClaimed) return;

            var claimed = new TierReward { Tier = tier, RewardId = reward.RewardId, Claimed = true };
            _data.ClaimedRewards.Add(claimed);
            OnRewardClaimed?.Invoke(claimed);
        }

        public bool HasClaimedReward(int tier)
        {
            return _data.ClaimedRewards.Exists(r => r.Tier == tier);
        }

        public void SaveProgress()
        {
            try
            {
                string json = JsonUtility.ToJson(_data, true);
                File.WriteAllText(SavePath, json);
            }
            catch (Exception ex)
            {
                Debug.LogWarning($"[ProgressionSaveState] Failed to save: {ex.Message}");
            }
        }

        public void LoadProgress()
        {
            try
            {
                if (File.Exists(SavePath))
                {
                    string json = File.ReadAllText(SavePath);
                    _data = JsonUtility.FromJson<ProgressionSaveData>(json) ?? new ProgressionSaveData();
                }
            }
            catch (Exception ex)
            {
                Debug.LogWarning($"[ProgressionSaveState] Failed to load: {ex.Message}");
                _data = new ProgressionSaveData();
            }
        }

        public void ResetProgress()
        {
            _data = new ProgressionSaveData();
            SaveProgress();
        }
    }
}
