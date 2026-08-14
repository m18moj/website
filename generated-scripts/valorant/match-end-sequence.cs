/*
 * ScriptForge — Match Point & MVP Sequence
 * Pack: Valorant Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Match-point round highlighting, ace/clutch replay triggers, end-game MVP selection.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using UnrealEngine;

namespace ScriptForge.Systems
{
    public enum HighlightReason { Ace, Clutch1v3Plus, MultiKill, MatchPointRound }

    [Serializable]
    public struct HighlightMoment
    {
        public string playerId;
        public HighlightReason reason;
        public int roundNumber;
    }

    [Serializable]
    public class MatchPlayerSummary
    {
        public string playerId;
        public string displayName;
        public int kills;
        public int deaths;
        public int assists;
        public int combatScore;
        public int acesEarned;
        public int clutchesWon;
    }

    /// <summary>
    /// Coordinates the end-of-match presentation flow: detects match-point rounds, flags
    /// highlight-worthy moments (aces/clutches) for cinematic replay triggers, and selects
    /// the match MVP once the final round concludes.
    /// </summary>
    public class MatchEndSequenceController : MonoBehaviour
    {
        [Header("Match Rules")]
        public int roundsToWinMatch = 13;

        [Header("MVP Weighting")]
        public float killWeight = 1.5f;
        public float deathPenalty = 0.75f;
        public float assistWeight = 0.5f;
        public float combatScoreWeight = 0.01f;
        public float aceBonus = 5f;
        public float clutchBonus = 4f;

        public event Action<int> OnMatchPointReached;      // team score that triggered match point
        public event Action<HighlightMoment> OnHighlightTriggered;
        public event Action<MatchPlayerSummary> OnMvpSelected;
        public event Action OnMatchEndSequenceComplete;

        private readonly List<HighlightMoment> _highlights = new List<HighlightMoment>();

        /// <summary>Call after every round score update to check for match-point conditions.</summary>
        public void EvaluateMatchPoint(int teamAScore, int teamBScore)
        {
            bool teamAAtMatchPoint = teamAScore == roundsToWinMatch - 1;
            bool teamBAtMatchPoint = teamBScore == roundsToWinMatch - 1;

            if (teamAAtMatchPoint || teamBAtMatchPoint)
            {
                OnMatchPointReached?.Invoke(teamAAtMatchPoint ? teamAScore : teamBScore);
            }
        }

        /// <summary>Call when a player scores 5 kills in a single round (an ace).</summary>
        public void RegisterAce(string playerId, int roundNumber)
        {
            var moment = new HighlightMoment { playerId = playerId, reason = HighlightReason.Ace, roundNumber = roundNumber };
            _highlights.Add(moment);
            OnHighlightTriggered?.Invoke(moment);
        }

        /// <summary>Call when a player wins a round as the last surviving member against 3+ enemies.</summary>
        public void RegisterClutch(string playerId, int roundNumber)
        {
            var moment = new HighlightMoment { playerId = playerId, reason = HighlightReason.Clutch1v3Plus, roundNumber = roundNumber };
            _highlights.Add(moment);
            OnHighlightTriggered?.Invoke(moment);
        }

        public IReadOnlyList<HighlightMoment> GetHighlightReel() => _highlights;

        /// <summary>
        /// Call once the deciding round ends. Scores every participant and fires the
        /// MVP-selected event, then signals the presentation sequence is complete.
        /// </summary>
        public void RunMatchEndSequence(List<MatchPlayerSummary> allPlayers)
        {
            StartCoroutine(SequenceRoutine(allPlayers));
        }

        private IEnumerator SequenceRoutine(List<MatchPlayerSummary> allPlayers)
        {
            // Small delay to let final-kill camera / round-end UI play out first.
            yield return new WaitForSeconds(2f);

            MatchPlayerSummary mvp = SelectMvp(allPlayers);
            if (mvp != null)
                OnMvpSelected?.Invoke(mvp);

            yield return new WaitForSeconds(1f);
            OnMatchEndSequenceComplete?.Invoke();
        }

        private MatchPlayerSummary SelectMvp(List<MatchPlayerSummary> allPlayers)
        {
            if (allPlayers == null || allPlayers.Count == 0) return null;

            return allPlayers
                .OrderByDescending(p => ComputeMvpScore(p))
                .First();
        }

        private float ComputeMvpScore(MatchPlayerSummary p)
        {
            float score = p.kills * killWeight
                        - p.deaths * deathPenalty
                        + p.assists * assistWeight
                        + p.combatScore * combatScoreWeight
                        + p.acesEarned * aceBonus
                        + p.clutchesWon * clutchBonus;
            return score;
        }
    }
}
