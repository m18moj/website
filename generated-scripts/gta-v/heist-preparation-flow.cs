/*
 * ScripForge — Heist Setup & Crew Payout
 * Pack: GTA V Pack | Category: Missions
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Tracks multi-stage heist prep objectives and splits the final payout across a simulated crew.
 *
 * Written for single-player use via ScriptHookVDotNet — not for GTA Online.
 */

using System;
using System.Collections.Generic;
using GTA;
using GTA.Math;
using GTA.UI;

namespace ScripForge.Missions
{
    internal class PrepObjective
    {
        public string Name;
        public Vector3 Location;
        public bool Complete;

        public PrepObjective(string name, Vector3 location)
        {
            Name = name;
            Location = location;
            Complete = false;
        }
    }

    internal class CrewMember
    {
        public string Name;
        public float CutPercent; // fraction of remaining take, e.g. 0.20 = 20%

        public CrewMember(string name, float cutPercent)
        {
            Name = name;
            CutPercent = cutPercent;
        }
    }

    /// <summary>
    /// Models a heist as a set of prep objectives (steal a vehicle, scout the vault, hire a
    /// hacker) that must all complete before the final job unlocks. On completion, the total
    /// take is split across a crew roster by percentage cut, with the player getting the remainder.
    /// </summary>
    public class HeistPreparationFlow : Script
    {
        private readonly List<PrepObjective> _objectives = new List<PrepObjective>
        {
            new PrepObjective("Steal a getaway vehicle", new Vector3(-50.0f, -1100.0f, 26.4f)),
            new PrepObjective("Scout the target location", new Vector3(150.0f, -1300.0f, 29.2f)),
            new PrepObjective("Recruit a hacker", new Vector3(300.0f, -900.0f, 28.9f)),
        };

        private readonly List<CrewMember> _crew = new List<CrewMember>
        {
            new CrewMember("Driver", 0.20f),
            new CrewMember("Hacker", 0.15f),
            new CrewMember("Gunman", 0.15f),
        };

        private const int HeistPayout = 500000;
        private bool _heistUnlocked;
        private bool _heistComplete;
        private const float CompletionRadius = 4.0f;

        public HeistPreparationFlow()
        {
            Tick += OnTick;
            SetupBlips();
        }

        private void SetupBlips()
        {
            foreach (var obj in _objectives)
            {
                Blip blip = World.CreateBlip(obj.Location);
                blip.Sprite = BlipSprite.Waypoint;
                blip.Color = BlipColor.Blue;
                blip.Name = obj.Name;
            }
        }

        private void OnTick(object sender, EventArgs e)
        {
            if (_heistComplete)
                return;

            if (!_heistUnlocked)
            {
                CheckPrepObjectives();
                return;
            }

            CheckFinalHeistTrigger();
        }

        private void CheckPrepObjectives()
        {
            Vector3 playerPos = Game.Player.Character.Position;

            foreach (var obj in _objectives)
            {
                if (obj.Complete)
                    continue;

                if (playerPos.DistanceTo(obj.Location) <= CompletionRadius)
                {
                    obj.Complete = true;
                    Notification.PostTicker("~g~Prep objective complete: " + obj.Name, false);
                }
            }

            if (AllObjectivesComplete())
            {
                _heistUnlocked = true;
                Notification.PostTicker("~y~All prep done. The heist is ready — head to the target.", false);
            }
        }

        private bool AllObjectivesComplete()
        {
            foreach (var obj in _objectives)
            {
                if (!obj.Complete)
                    return false;
            }
            return true;
        }

        private void CheckFinalHeistTrigger()
        {
            Vector3 finalTarget = new Vector3(400.0f, -1500.0f, 29.5f);
            if (Game.Player.Character.Position.DistanceTo(finalTarget) <= CompletionRadius)
            {
                ExecuteHeistPayout();
            }
        }

        private void ExecuteHeistPayout()
        {
            _heistComplete = true;

            int remaining = HeistPayout;
            string breakdown = "Heist complete! Payout breakdown:\n";

            foreach (var member in _crew)
            {
                int cut = (int)(HeistPayout * member.CutPercent);
                remaining -= cut;
                breakdown += string.Format("{0}: ${1:N0}\n", member.Name, cut);
            }

            breakdown += string.Format("You: ${0:N0}", remaining);

            Game.Player.Money += remaining;
            Notification.PostTicker("~g~" + breakdown.Replace("\n", "  "), false);
        }
    }
}
