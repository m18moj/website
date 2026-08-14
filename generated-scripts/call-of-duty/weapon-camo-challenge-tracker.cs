/*
 * ScriptForge — Weapon Camo Challenge Tracker
 * Pack: Call of Duty Pack | Category: Progression
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Tracks per-weapon camo unlock challenges and reports progress toward completion.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace ScriptForge.Progression
{
    /// <summary>Types of trackable in-match events a camo challenge might require.</summary>
    public enum ChallengeEventType
    {
        Kill,
        HeadshotKill,
        MultiKill,
        LongShotKill,
        NoScopeKill,
        MeleeKill
    }

    [Serializable]
    public class CamoChallenge
    {
        public string challengeId;
        public string description;
        public ChallengeEventType requiredEvent;
        public int requiredCount;
        [HideInInspector] public int currentCount;
        public bool isComplete;
    }

    [Serializable]
    public class WeaponCamoProgress
    {
        public string weaponId;
        public string camoId;
        public string camoDisplayName;
        public List<CamoChallenge> challenges = new List<CamoChallenge>();
        public bool unlocked;
    }

    /// <summary>
    /// Tracks progress on per-weapon camo challenges as gameplay events are reported in,
    /// unlocking each camo once every one of its linked challenges is satisfied.
    /// </summary>
    public class WeaponCamoChallengeTracker : MonoBehaviour
    {
        [SerializeField] private List<WeaponCamoProgress> trackedCamos = new List<WeaponCamoProgress>();

        public event Action<WeaponCamoProgress, CamoChallenge> OnChallengeProgress;
        public event Action<WeaponCamoProgress> OnCamoUnlocked;

        /// <summary>Call this whenever a relevant gameplay event happens (e.g. from your damage/kill pipeline).</summary>
        public void ReportEvent(string weaponId, ChallengeEventType eventType, int amount = 1)
        {
            foreach (var camo in trackedCamos.Where(c => c.weaponId == weaponId && !c.unlocked))
            {
                bool camoUpdated = false;

                foreach (var challenge in camo.challenges)
                {
                    if (challenge.isComplete || challenge.requiredEvent != eventType) continue;

                    challenge.currentCount = Mathf.Min(challenge.currentCount + amount, challenge.requiredCount);
                    camoUpdated = true;

                    if (challenge.currentCount >= challenge.requiredCount)
                    {
                        challenge.isComplete = true;
                    }

                    OnChallengeProgress?.Invoke(camo, challenge);
                }

                if (camoUpdated && camo.challenges.All(c => c.isComplete))
                {
                    camo.unlocked = true;
                    OnCamoUnlocked?.Invoke(camo);
                }
            }
        }

        /// <summary>Returns 0-1 fractional completion across all challenges for a given camo.</summary>
        public float GetCamoCompletionFraction(string weaponId, string camoId)
        {
            var camo = trackedCamos.FirstOrDefault(c => c.weaponId == weaponId && c.camoId == camoId);
            if (camo == null || camo.challenges.Count == 0) return 0f;

            float totalFraction = camo.challenges.Sum(c => (float)c.currentCount / Mathf.Max(1, c.requiredCount));
            return Mathf.Clamp01(totalFraction / camo.challenges.Count);
        }

        public IEnumerable<WeaponCamoProgress> GetCamosForWeapon(string weaponId)
        {
            return trackedCamos.Where(c => c.weaponId == weaponId);
        }

        public IEnumerable<WeaponCamoProgress> GetUnlockedCamos()
        {
            return trackedCamos.Where(c => c.unlocked);
        }

        /// <summary>Resets all progress for a specific camo, useful for seasonal challenge rotations.</summary>
        public void ResetCamoProgress(string weaponId, string camoId)
        {
            var camo = trackedCamos.FirstOrDefault(c => c.weaponId == weaponId && c.camoId == camoId);
            if (camo == null) return;

            camo.unlocked = false;
            foreach (var challenge in camo.challenges)
            {
                challenge.currentCount = 0;
                challenge.isComplete = false;
            }
        }
    }
}
