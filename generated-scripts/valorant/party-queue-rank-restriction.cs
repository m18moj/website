/*
 * ScripForge — Party Queue & Rank Restriction
 * Pack: Valorant Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Party-size-based rank-range matchmaking restriction to prevent high/low-skill queue abuse.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections.Generic;
using System.Linq;
using UnrealEngine;

namespace ScripForge.Systems
{
    public enum RankTier { Iron, Bronze, Silver, Gold, Platinum, Diamond, Immortal, Radiant }

    [Serializable]
    public class PartyMember
    {
        public string playerId;
        public RankTier rank;
    }

    public struct QueueEligibilityResult
    {
        public bool eligible;
        public string reason;
        public int allowedTierSpread;
        public int actualTierSpread;
    }

    /// <summary>
    /// Enforces how wide a rank gap a party is allowed to queue with, scaling the allowed spread
    /// down as party size grows. This exists to stop a duo of wildly mismatched ranks (or a full
    /// stack smurfing a low-rank friend) from dragging games into lopsided matchmaking. Query
    /// CheckEligibility before accepting a party into the matchmaking pool.
    /// </summary>
    public static class PartyQueueRankRestriction
    {
        /// <summary>
        /// Maximum allowed tier spread (highest rank index minus lowest) indexed by party size.
        /// Index 0/1 (solo/duo) get the widest leash; larger parties are squeezed tighter to
        /// keep five-stacks from queuing across drastically different skill levels.
        /// </summary>
        private static readonly Dictionary<int, int> MaxSpreadByPartySize = new Dictionary<int, int>
        {
            { 1, int.MaxValue }, // Solo queue: no restriction, matchmaker handles skill separately.
            { 2, 4 },
            { 3, 3 },
            { 4, 2 },
            { 5, 1 },
        };

        // Special-case cutoff: parties containing any Immortal+ member get a tighter cap regardless of size.
        private const RankTier HighSkillFloor = RankTier.Immortal;
        private const int HighSkillPartyMaxSpread = 1;

        /// <summary>Evaluates whether a party's current rank composition is allowed to enter queue together.</summary>
        public static QueueEligibilityResult CheckEligibility(List<PartyMember> partyMembers)
        {
            if (partyMembers == null || partyMembers.Count == 0)
            {
                return new QueueEligibilityResult { eligible = false, reason = "Party is empty." };
            }

            int size = Mathf.Clamp(partyMembers.Count, 1, 5);
            int lowest = partyMembers.Min(m => (int)m.rank);
            int highest = partyMembers.Max(m => (int)m.rank);
            int actualSpread = highest - lowest;

            int allowedSpread = MaxSpreadByPartySize[size];

            bool anyHighSkill = partyMembers.Any(m => m.rank >= HighSkillFloor);
            if (anyHighSkill && size > 1)
            {
                allowedSpread = Math.Min(allowedSpread, HighSkillPartyMaxSpread);
            }

            var result = new QueueEligibilityResult
            {
                allowedTierSpread = allowedSpread,
                actualTierSpread = actualSpread,
            };

            if (actualSpread > allowedSpread)
            {
                result.eligible = false;
                result.reason = $"Rank spread of {actualSpread} tiers exceeds the {allowedSpread}-tier cap for a party of {size}.";
                return result;
            }

            result.eligible = true;
            result.reason = "OK";
            return result;
        }

        /// <summary>
        /// Returns the rank range (inclusive) the matchmaker should search within for this party,
        /// centered on the party's average rank rather than its extremes.
        /// </summary>
        public static (RankTier lowBound, RankTier highBound) GetSearchRange(List<PartyMember> partyMembers, int extraTierPadding = 1)
        {
            double average = partyMembers.Average(m => (int)m.rank);
            int center = (int)Math.Round(average);

            int low = Mathf.Clamp(center - extraTierPadding, (int)RankTier.Iron, (int)RankTier.Radiant);
            int high = Mathf.Clamp(center + extraTierPadding, (int)RankTier.Iron, (int)RankTier.Radiant);

            return ((RankTier)low, (RankTier)high);
        }

        /// <summary>Identifies which specific members are outside the party's own allowed spread, for UI messaging.</summary>
        public static List<string> FindOutlierPlayerIds(List<PartyMember> partyMembers)
        {
            var outliers = new List<string>();
            if (partyMembers.Count <= 1) return outliers;

            int median = (int)Math.Round(partyMembers.Select(m => (int)m.rank).OrderBy(v => v).Skip(partyMembers.Count / 2).First());
            int allowedSpread = MaxSpreadByPartySize[Mathf.Clamp(partyMembers.Count, 1, 5)];

            foreach (var member in partyMembers)
            {
                if (Math.Abs((int)member.rank - median) > allowedSpread)
                    outliers.Add(member.playerId);
            }

            return outliers;
        }
    }
}
