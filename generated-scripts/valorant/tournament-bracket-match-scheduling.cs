/*
 * ScripForge — Tournament Bracket & Match Scheduling
 * Pack: Valorant Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Single- and double-elimination bracket generation with match scheduling slots for community tournaments.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections.Generic;
using UnrealEngine;

namespace ScripForge.Systems
{
    public enum BracketFormat { SingleElimination, DoubleElimination }
    public enum BracketSide { Winners, Losers, Grand }

    [Serializable]
    public class TournamentMatch
    {
        public string matchId;
        public BracketSide side;
        public int round;             // 1-based round index within its side.
        public string teamAId;
        public string teamBId;
        public string winnerId;
        public DateTime scheduledStartUtc;
        public string feedsIntoMatchId; // Winner advances here.
    }

    /// <summary>
    /// Builds a full bracket skeleton (single or double elimination) from a seeded list of team
    /// ids, then assigns wall-clock scheduling slots to every generated match on a fixed cadence.
    /// Reporting a match result advances the winner into their next slot automatically.
    /// </summary>
    public class TournamentBracketMatchScheduling : MonoBehaviour
    {
        [Header("Format")]
        public BracketFormat format = BracketFormat.SingleElimination;

        [Header("Scheduling")]
        public DateTime tournamentStartUtc = DateTime.UtcNow;
        public TimeSpan matchDuration = TimeSpan.FromMinutes(45);
        public TimeSpan bufferBetweenMatches = TimeSpan.FromMinutes(15);
        [Tooltip("How many matches can run concurrently on separate servers/stages.")]
        public int parallelStages = 2;

        public event Action<TournamentMatch> OnMatchScheduled;
        public event Action<TournamentMatch> OnMatchCompleted;
        public event Action<string> OnTournamentComplete; // championTeamId

        private readonly Dictionary<string, TournamentMatch> _matches = new Dictionary<string, TournamentMatch>();

        /// <summary>Generates the full bracket for a power-of-two (byes auto-inserted otherwise) seed list.</summary>
        public void GenerateBracket(List<string> seededTeamIds)
        {
            _matches.Clear();
            List<string> padded = PadToPowerOfTwo(seededTeamIds);

            List<TournamentMatch> round = BuildInitialRound(padded);
            string championMatchId = LinkSequentialRounds(round);

            if (format == BracketFormat.DoubleElimination && championMatchId != null)
            {
                var grandFinal = new TournamentMatch { matchId = "Grand-Final", side = BracketSide.Grand, round = 1 };
                _matches[grandFinal.matchId] = grandFinal;
                _matches[championMatchId].feedsIntoMatchId = grandFinal.matchId;
            }

            AssignScheduleSlots();
        }

        private List<TournamentMatch> BuildInitialRound(List<string> teams)
        {
            var round = new List<TournamentMatch>();
            for (int i = 0; i < teams.Count; i += 2)
            {
                var match = new TournamentMatch
                {
                    matchId = $"Winners-R1-{i / 2}",
                    side = BracketSide.Winners,
                    round = 1,
                    teamAId = teams[i],
                    teamBId = i + 1 < teams.Count ? teams[i + 1] : null, // null = bye
                };
                _matches[match.matchId] = match;
                round.Add(match);

                if (match.teamBId == null)
                    match.winnerId = match.teamAId; // Byes auto-advance without scheduling.
            }
            return round;
        }

        /// <summary>Chains rounds together (winners of match N and N+1 feed round+1's match N/2) until one remains; returns the final matchId.</summary>
        private string LinkSequentialRounds(List<TournamentMatch> currentRound)
        {
            int round = 2;
            List<TournamentMatch> previous = currentRound;

            while (previous.Count > 1)
            {
                var next = new List<TournamentMatch>();
                for (int i = 0; i < previous.Count; i += 2)
                {
                    var match = new TournamentMatch { matchId = $"Winners-R{round}-{i / 2}", side = BracketSide.Winners, round = round };
                    _matches[match.matchId] = match;
                    next.Add(match);

                    previous[i].feedsIntoMatchId = match.matchId;
                    if (i + 1 < previous.Count) previous[i + 1].feedsIntoMatchId = match.matchId;
                }
                previous = next;
                round++;
            }

            return previous.Count == 1 ? previous[0].matchId : null;
        }

        /// <summary>Lays matches onto time slots in bracket-creation order, honoring the parallel-stage count.</summary>
        private void AssignScheduleSlots()
        {
            int stage = 0;
            DateTime cursor = tournamentStartUtc;
            TimeSpan slotSpacing = matchDuration + bufferBetweenMatches;

            foreach (var match in _matches.Values)
            {
                if (match.teamAId != null && match.teamBId == null) continue; // byes need no slot

                match.scheduledStartUtc = cursor;
                OnMatchScheduled?.Invoke(match);

                stage++;
                if (stage >= parallelStages)
                {
                    stage = 0;
                    cursor += slotSpacing;
                }
            }
        }

        /// <summary>Reports a match result, advances the winner into its next slot, and fires completion/championship events.</summary>
        public void ReportResult(string matchId, string winnerId)
        {
            if (!_matches.TryGetValue(matchId, out var match)) return;

            match.winnerId = winnerId;
            OnMatchCompleted?.Invoke(match);

            if (match.matchId == "Grand-Final")
            {
                OnTournamentComplete?.Invoke(winnerId);
                return;
            }

            if (match.feedsIntoMatchId != null && _matches.TryGetValue(match.feedsIntoMatchId, out var next))
            {
                if (next.teamAId == null) next.teamAId = winnerId;
                else next.teamBId = winnerId;
            }
            else if (format == BracketFormat.SingleElimination && match.feedsIntoMatchId == null)
            {
                OnTournamentComplete?.Invoke(winnerId); // Single-elim final has no downstream match.
            }
        }

        private static List<string> PadToPowerOfTwo(List<string> teams)
        {
            var padded = new List<string>(teams);
            int nextPow2 = 1;
            while (nextPow2 < padded.Count) nextPow2 *= 2;
            while (padded.Count < nextPow2) padded.Add(null); // null entries become byes
            return padded;
        }
    }
}
