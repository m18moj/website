/*
 * ScripForge — Mission Trigger & Checkpoint Flow
 * Pack: GTA V Pack | Category: Missions
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Drives a linear mission through zone-entry triggers, checkpoint blips, and respawn-on-fail flow.
 *
 * Written for single-player use via ScriptHookVDotNet — not for GTA Online.
 */

using System;
using System.Collections.Generic;
using GTA;
using GTA.Math;
using GTA.Native;

namespace ScripForge.Missions
{
    internal enum MissionStage
    {
        NotStarted,
        EnRouteToStart,
        Checkpoint1,
        Checkpoint2,
        FinalObjective,
        Complete,
        Failed
    }

    /// <summary>
    /// Scripts a short mission with sequential checkpoints. Entering each zone advances the
    /// stage, spawns the next objective blip/checkpoint, and handles fail-state respawn.
    /// </summary>
    public class MissionEventTrigger : Script
    {
        private MissionStage _stage = MissionStage.NotStarted;
        private readonly List<Vector3> _checkpoints = new List<Vector3>
        {
            new Vector3(215.0f, -810.0f, 30.7f),   // start trigger zone
            new Vector3(450.5f, -900.2f, 28.4f),   // checkpoint 1
            new Vector3(730.1f, -1088.7f, 22.2f),  // checkpoint 2
            new Vector3(1010.3f, -1250.9f, 29.5f), // final objective
        };

        private const float TriggerRadius = 5.0f;
        private Blip _objectiveBlip;
        private Vector3 _lastCheckpointReached;
        private DateTime _failCooldown = DateTime.MinValue;

        public MissionEventTrigger()
        {
            Tick += OnTick;
            KeyDown += OnKeyDown;
            StartMission();
        }

        private void OnKeyDown(object sender, KeyEventArgs e)
        {
            // F6 manually aborts and restarts the mission for testing/respawn purposes.
            if (e.KeyCode == System.Windows.Forms.Keys.F6)
            {
                FailMission("Manual abort");
            }
        }

        private void StartMission()
        {
            _stage = MissionStage.EnRouteToStart;
            _lastCheckpointReached = Game.Player.Character.Position;
            SetObjective(_checkpoints[0], "Head to the mission start point");
        }

        private void OnTick(object sender, EventArgs e)
        {
            if (_stage == MissionStage.NotStarted || _stage == MissionStage.Complete || _stage == MissionStage.Failed)
                return;

            Ped player = Game.Player.Character;
            if (player == null || !player.Exists())
                return;

            // Fail state: player died or got busted mid-mission.
            if ((player.IsDead || Game.Player.WantedLevel > 0 && _stage == MissionStage.FinalObjective) && DateTime.Now > _failCooldown)
            {
                if (player.IsDead)
                    FailMission("You died");
                return;
            }

            Vector3 target = GetCurrentTargetZone();
            if (target == Vector3.Zero)
                return;

            float dist = player.Position.DistanceTo(target);
            if (dist <= TriggerRadius)
            {
                AdvanceStage();
            }
        }

        private Vector3 GetCurrentTargetZone()
        {
            switch (_stage)
            {
                case MissionStage.EnRouteToStart: return _checkpoints[0];
                case MissionStage.Checkpoint1: return _checkpoints[1];
                case MissionStage.Checkpoint2: return _checkpoints[2];
                case MissionStage.FinalObjective: return _checkpoints[3];
                default: return Vector3.Zero;
            }
        }

        private void AdvanceStage()
        {
            _lastCheckpointReached = GetCurrentTargetZone();

            switch (_stage)
            {
                case MissionStage.EnRouteToStart:
                    _stage = MissionStage.Checkpoint1;
                    SetObjective(_checkpoints[1], "Proceed to checkpoint 1");
                    break;
                case MissionStage.Checkpoint1:
                    _stage = MissionStage.Checkpoint2;
                    SetObjective(_checkpoints[2], "Proceed to checkpoint 2");
                    break;
                case MissionStage.Checkpoint2:
                    _stage = MissionStage.FinalObjective;
                    SetObjective(_checkpoints[3], "Complete the final objective");
                    break;
                case MissionStage.FinalObjective:
                    _stage = MissionStage.Complete;
                    Notification.PostTicker("~g~Mission Passed!", false);
                    ClearBlip();
                    break;
            }
        }

        private void SetObjective(Vector3 pos, string message)
        {
            ClearBlip();
            _objectiveBlip = World.CreateBlip(pos);
            _objectiveBlip.Sprite = BlipSprite.Standard;
            _objectiveBlip.Color = BlipColor.Yellow;
            _objectiveBlip.IsRouteActive = true;
            Notification.PostTicker(message, false);
        }

        private void FailMission(string reason)
        {
            _stage = MissionStage.Failed;
            _failCooldown = DateTime.Now.AddSeconds(3);
            Notification.PostTicker("~r~Mission Failed: " + reason, false);
            ClearBlip();

            // Respawn player at the last checkpoint reached (or start if none) and restart flow.
            Game.Player.Character.Position = _lastCheckpointReached;
            Game.Player.Character.Health = Game.Player.Character.MaxHealth;
            StartMission();
        }

        private void ClearBlip()
        {
            if (_objectiveBlip != null && _objectiveBlip.Exists())
                _objectiveBlip.Remove();
        }
    }
}
