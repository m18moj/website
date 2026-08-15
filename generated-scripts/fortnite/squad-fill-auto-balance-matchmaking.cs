/*
 * ScripForge — Squad Fill & Auto-Balance Matchmaking
 * Pack: Fortnite Pack | Category: Squad
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Fills incomplete squads before match start and auto-balances skill rating evenly across the lobby.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections.Generic;
using System.Linq;
using UnrealEngine;

namespace ScripForge.Fortnite.Squad
{
    [Serializable]
    public class LobbyPlayer
    {
        public string PlayerId;
        public int SkillRating;
        public string SquadId; // null/empty while unassigned
    }

    public class Squad
    {
        public string SquadId;
        public List<LobbyPlayer> Members = new List<LobbyPlayer>();
        public int TotalSkillRating => Members.Sum(m => m.SkillRating);
    }

    // Runs during the pre-match lobby phase: tops off partial squads with solo/duo queuers,
    // then redistributes members so every squad's combined skill rating is roughly even.
    public class SquadFillAutoBalanceMatchmaking : MonoBehaviour
    {
        public event Action<Squad> OnSquadFilled;
        public event Action OnLobbyBalanced;

        [Header("Squad Settings")]
        [SerializeField] private int _squadSize = 4;
        [SerializeField] private int _maxSkillRatingSpread = 150;

        private readonly Dictionary<string, Squad> _squads = new Dictionary<string, Squad>();
        private readonly List<LobbyPlayer> _unassignedQueue = new List<LobbyPlayer>();

        public void RegisterSquad(string squadId, List<LobbyPlayer> initialMembers)
        {
            var squad = new Squad { SquadId = squadId, Members = new List<LobbyPlayer>(initialMembers) };
            foreach (LobbyPlayer member in squad.Members) member.SquadId = squadId;
            _squads[squadId] = squad;
        }

        public void EnqueueSoloPlayer(LobbyPlayer player)
        {
            player.SquadId = null;
            _unassignedQueue.Add(player);
        }

        // Fills every squad below capacity with queued solo players, preferring the lowest-skill queuer first
        // so a strong squad doesn't get an outsized boost from a high-rated fill.
        public void FillIncompleteSquads()
        {
            _unassignedQueue.Sort((a, b) => a.SkillRating.CompareTo(b.SkillRating));

            foreach (Squad squad in _squads.Values)
            {
                while (squad.Members.Count < _squadSize && _unassignedQueue.Count > 0)
                {
                    LobbyPlayer filler = _unassignedQueue[0];
                    _unassignedQueue.RemoveAt(0);

                    filler.SquadId = squad.SquadId;
                    squad.Members.Add(filler);
                }

                if (squad.Members.Count == _squadSize)
                {
                    OnSquadFilled?.Invoke(squad);
                }
            }
        }

        // Swaps individual members between the highest- and lowest-rated squads until the spread
        // between any two squads' total skill rating falls under the configured threshold, or no
        // further improving swap exists.
        public void AutoBalanceLobby()
        {
            const int maxPasses = 32;

            for (int pass = 0; pass < maxPasses; pass++)
            {
                List<Squad> ranked = _squads.Values.OrderByDescending(s => s.TotalSkillRating).ToList();
                if (ranked.Count < 2) break;

                Squad strongest = ranked[0];
                Squad weakest = ranked[ranked.Count - 1];
                int spread = strongest.TotalSkillRating - weakest.TotalSkillRating;

                if (spread <= _maxSkillRatingSpread) break;

                if (!TrySwapToReduceSpread(strongest, weakest))
                {
                    break; // no beneficial swap available, stop to avoid infinite churn
                }
            }

            OnLobbyBalanced?.Invoke();
        }

        private bool TrySwapToReduceSpread(Squad strongest, Squad weakest)
        {
            LobbyPlayer bestFromStrong = null;
            LobbyPlayer bestFromWeak = null;
            int bestImprovement = 0;

            foreach (LobbyPlayer high in strongest.Members)
            {
                foreach (LobbyPlayer low in weakest.Members)
                {
                    int delta = high.SkillRating - low.SkillRating;
                    if (delta <= 0) continue;

                    int newSpread = Math.Abs((strongest.TotalSkillRating - delta) - (weakest.TotalSkillRating + delta));
                    int currentSpread = strongest.TotalSkillRating - weakest.TotalSkillRating;
                    int improvement = currentSpread - newSpread;

                    if (improvement > bestImprovement)
                    {
                        bestImprovement = improvement;
                        bestFromStrong = high;
                        bestFromWeak = low;
                    }
                }
            }

            if (bestFromStrong == null) return false;

            strongest.Members.Remove(bestFromStrong);
            weakest.Members.Remove(bestFromWeak);
            strongest.Members.Add(bestFromWeak);
            weakest.Members.Add(bestFromStrong);
            bestFromStrong.SquadId = weakest.SquadId;
            bestFromWeak.SquadId = strongest.SquadId;

            return true;
        }
    }
}
