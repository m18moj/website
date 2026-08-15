/*
 * ScripForge — Season Quest & XP Milestone Tracker
 * Pack: Fortnite Pack | Category: Progression
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Tracks weekly quest objective progress and awards milestone bonus XP as thresholds are crossed.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using System;
using System.Collections.Generic;
using UnityEngine;

namespace ScripForge.Fortnite.Progression
{
    [Serializable]
    public class SeasonQuest
    {
        public string questId;
        public string description;
        public int targetProgress;
        public int currentProgress;
        public int xpReward;
        public bool completed;

        public float ProgressPercent => targetProgress > 0 ? Mathf.Clamp01((float)currentProgress / targetProgress) : 0f;
    }

    [Serializable]
    public struct XpMilestone
    {
        public int completedQuestThreshold; // e.g. "complete 5 weekly quests"
        public int bonusXp;
        public bool claimed;
    }

    /// <summary>
    /// Tracks a set of weekly quests for the current season, updates their progress from
    /// gameplay events, awards per-quest XP on completion, and grants additional bonus XP
    /// when the player crosses configured completed-quest-count milestones.
    /// </summary>
    public class SeasonQuestXpMilestoneTracker : MonoBehaviour
    {
        [Header("Weekly Quests")]
        [SerializeField] private List<SeasonQuest> activeQuests = new List<SeasonQuest>();

        [Header("Milestones")]
        [SerializeField] private List<XpMilestone> milestones = new List<XpMilestone>();

        [Header("Totals")]
        [SerializeField] private int totalXp;
        [SerializeField] private int completedQuestCount;

        public int TotalXp => totalXp;
        public int CompletedQuestCount => completedQuestCount;
        public IReadOnlyList<SeasonQuest> ActiveQuests => activeQuests;

        public event Action<SeasonQuest> OnQuestCompleted;
        public event Action<XpMilestone> OnMilestoneReached;
        public event Action<int> OnXpAwarded;

        /// <summary>
        /// Adds progress to a quest matching questId. Call this from gameplay events
        /// (e.g. "eliminate 3 opponents", "deal damage with SMGs").
        /// </summary>
        public void AddProgress(string questId, int amount)
        {
            SeasonQuest quest = activeQuests.Find(q => q.questId == questId);
            if (quest == null || quest.completed || amount <= 0)
                return;

            quest.currentProgress = Mathf.Min(quest.targetProgress, quest.currentProgress + amount);

            if (quest.currentProgress >= quest.targetProgress)
            {
                CompleteQuest(quest);
            }
        }

        private void CompleteQuest(SeasonQuest quest)
        {
            quest.completed = true;
            completedQuestCount++;

            AwardXp(quest.xpReward);
            OnQuestCompleted?.Invoke(quest);

            CheckMilestones();
        }

        private void AwardXp(int amount)
        {
            if (amount <= 0)
                return;

            totalXp += amount;
            OnXpAwarded?.Invoke(amount);
        }

        private void CheckMilestones()
        {
            for (int i = 0; i < milestones.Count; i++)
            {
                XpMilestone milestone = milestones[i];
                if (milestone.claimed)
                    continue;

                if (completedQuestCount >= milestone.completedQuestThreshold)
                {
                    milestone.claimed = true;
                    milestones[i] = milestone; // struct copy-back since List<struct> doesn't support in-place mutation

                    AwardXp(milestone.bonusXp);
                    OnMilestoneReached?.Invoke(milestone);
                }
            }
        }

        /// <summary>Returns the next unclaimed milestone, or null if all have been reached.</summary>
        public XpMilestone? GetNextMilestone()
        {
            foreach (var m in milestones)
            {
                if (!m.claimed)
                    return m;
            }
            return null;
        }

        /// <summary>Resets all quests and progress — call at the start of a new weekly cycle.</summary>
        public void ResetForNewWeek(List<SeasonQuest> newQuests)
        {
            activeQuests = newQuests ?? new List<SeasonQuest>();
            completedQuestCount = 0;
            // Note: totalXp and milestone claims persist across weeks by design (season-long progression).
        }
    }
}
