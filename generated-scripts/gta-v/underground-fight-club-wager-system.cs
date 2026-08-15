/*
 * ScripForge — Underground Fight Club Wager System
 * Pack: GTA V Pack | Category: Missions
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Wagered hand-to-hand bouts with odds calculation and a payout on match win.
 *
 * Written for single-player use via ScriptHookVDotNet — not for GTA Online.
 */

using System;
using System.Collections.Generic;
using GTA;
using GTA.Math;
using GTA.Native;
using GTA.UI;

namespace ScripForge.Missions
{
    internal class FightClubOpponent
    {
        public string Name;
        public PedHash Model;
        public int SkillRating; // 1 (pushover) - 10 (brutal)

        public FightClubOpponent(string name, PedHash model, int skillRating)
        {
            Name = name;
            Model = model;
            SkillRating = skillRating;
        }
    }

    /// <summary>
    /// A fist-fight arena the player can visit, pick an opponent with a skill rating, place a
    /// cash wager, and fight unarmed. Odds (and payout multiplier) are derived from the
    /// opponent's skill; winning pays out the wager times the odds, losing forfeits the wager.
    /// </summary>
    public class UndergroundFightClubWagerSystem : Script
    {
        private readonly Vector3 _arenaCenter = new Vector3(1355.0f, -1740.0f, 53.5f);
        private readonly List<FightClubOpponent> _roster = new List<FightClubOpponent>
        {
            new FightClubOpponent("Skinny Marcus", PedHash.Skidrow01AMY, 2),
            new FightClubOpponent("Big Tony", PedHash.Bikerdrag01AMM, 5),
            new FightClubOpponent("The Wrecker", PedHash.Prisoner01SMM, 8),
        };

        private const float InteractionRadius = 4.0f;
        private const int WagerAmount = 250;

        private Ped _activeOpponent;
        private FightClubOpponent _activeConfig;
        private bool _inMatch;
        private Blip _arenaBlip;
        private readonly Random _rng = new Random();

        public UndergroundFightClubWagerSystem()
        {
            Tick += OnTick;
            KeyDown += OnKeyDown;

            _arenaBlip = World.CreateBlip(_arenaCenter);
            _arenaBlip.Sprite = BlipSprite.Fistfight;
            _arenaBlip.Color = BlipColor.Red;
            _arenaBlip.Name = "Underground Fight Club";
        }

        private void OnTick(object sender, EventArgs e)
        {
            if (_inMatch)
                MonitorMatch();
        }

        private void OnKeyDown(object sender, KeyEventArgs e)
        {
            if (e.KeyCode != System.Windows.Forms.Keys.F7)
                return;

            if (_inMatch)
                return;

            float dist = Game.Player.Character.Position.DistanceTo(_arenaCenter);
            if (dist > InteractionRadius)
            {
                Notification.PostTicker("Get closer to the fight club to challenge someone.", false);
                return;
            }

            OfferMatch();
        }

        private void OfferMatch()
        {
            if (Game.Player.Money < WagerAmount)
            {
                Notification.PostTicker(string.Format("~r~You need ${0} to place a wager.", WagerAmount), false);
                return;
            }

            // Cycle to a random opponent from the roster each challenge.
            _activeConfig = _roster[_rng.Next(_roster.Count)];
            float odds = CalculateOdds(_activeConfig.SkillRating);

            Notification.PostTicker(string.Format("~y~{0} steps up (skill {1}/10). Odds: {2:0.0}x. Wager ${3}. Press F7 again to fight.",
                _activeConfig.Name, _activeConfig.SkillRating, odds, WagerAmount), false);

            SpawnOpponent();
        }

        private void SpawnOpponent()
        {
            Model model = new Model(_activeConfig.Model);
            model.Request(500);
            if (!model.IsLoaded)
            {
                Notification.PostTicker("~r~Opponent failed to load.", false);
                return;
            }

            Vector3 spawnPos = _arenaCenter + new Vector3(2.0f, 0f, 0f);
            _activeOpponent = World.CreatePed(model, spawnPos);
            if (_activeOpponent == null || !_activeOpponent.Exists())
                return;

            _activeOpponent.IsPersistent = true;
            Function.Call(Hash.SET_PED_COMBAT_ATTRIBUTES, _activeOpponent, 5, true); // fight in melee only
            Function.Call(Hash.SET_PED_COMBAT_MOVEMENT, _activeOpponent, 2);
            _activeOpponent.Weapons.RemoveAll();
            _activeOpponent.Task.FightAgainst(Game.Player.Character);

            Game.Player.Money -= WagerAmount;
            _inMatch = true;
            model.MarkAsNoLongerNeeded();
        }

        private void MonitorMatch()
        {
            if (_activeOpponent == null || !_activeOpponent.Exists())
            {
                EndMatch(false);
                return;
            }

            if (_activeOpponent.IsDead || _activeOpponent.Health <= 0)
            {
                EndMatch(true);
                return;
            }

            if (Game.Player.Character.IsDead)
            {
                EndMatch(false);
                return;
            }
        }

        private void EndMatch(bool playerWon)
        {
            _inMatch = false;

            if (playerWon)
            {
                float odds = CalculateOdds(_activeConfig.SkillRating);
                int payout = (int)(WagerAmount * odds);
                Game.Player.Money += payout;
                Notification.PostTicker(string.Format("~g~You beat {0}! Payout: ${1}", _activeConfig.Name, payout), false);
            }
            else
            {
                Notification.PostTicker(string.Format("~r~You lost the bout against {0}. Wager forfeited.", _activeConfig.Name), false);
            }

            if (_activeOpponent != null && _activeOpponent.Exists())
                _activeOpponent.MarkAsNoLongerNeeded();

            _activeOpponent = null;
            _activeConfig = null;
        }

        private float CalculateOdds(int skillRating)
        {
            // Tougher opponents pay out more: 1.2x for a pushover up to roughly 4.0x for the hardest fight.
            return 1.2f + (skillRating - 1) * 0.31f;
        }
    }
}
