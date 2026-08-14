/*
 * ScriptForge — Pedestrian & Traffic AI
 * Pack: GTA V Pack | Category: AI
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Nudges nearby traffic to stay lane-disciplined and gives pedestrians a panic/flee reaction near danger.
 *
 * Written for single-player use via ScriptHookVDotNet — not for GTA Online.
 */

using System;
using System.Collections.Generic;
using System.Linq;
using GTA;
using GTA.Math;
using GTA.Native;

namespace ScriptForge.AI
{
    /// <summary>
    /// Lightweight traffic/pedestrian behavior layer: keeps nearby vehicle AI driving
    /// with lane discipline and triggers flee/panic reactions for peds near gunfire or crashes.
    /// </summary>
    public class NpcTrafficAi : Script
    {
        private const float ScanRadius = 60f;
        private const float DangerRadius = 15f;
        private DateTime _nextScan = DateTime.MinValue;
        private readonly HashSet<int> _panickedPeds = new HashSet<int>();

        public NpcTrafficAi()
        {
            Tick += OnTick;
        }

        private void OnTick(object sender, EventArgs e)
        {
            if (DateTime.Now < _nextScan)
                return;

            _nextScan = DateTime.Now.AddMilliseconds(750);

            Vector3 playerPos = Game.Player.Character.Position;

            ApplyLaneDisciplineToTraffic(playerPos);
            ApplyPedPanicReactions(playerPos);
        }

        private void ApplyLaneDisciplineToTraffic(Vector3 center)
        {
            Vehicle[] nearby = World.GetNearbyVehicles(center, ScanRadius);

            foreach (Vehicle veh in nearby)
            {
                if (veh == null || !veh.Exists() || veh.Driver == null || !veh.Driver.Exists())
                    continue;

                if (veh == Game.Player.Character.CurrentVehicle)
                    continue;

                // Skip vehicles already assigned a specific task (e.g. combat/chase scripts).
                if (Function.Call<bool>(Hash.GET_IS_TASK_ACTIVE, veh.Driver, 2))
                    continue;

                // Keep ambient traffic cruising with standard driving style (lane-respecting,
                // avoids traffic, obeys lights) rather than reckless free-roam behavior.
                Function.Call(Hash.TASK_VEHICLE_DRIVE_WANDER, veh.Driver, veh, 20.0f,
                    (int)VehicleDrivingFlags.StopForVehicles | (int)VehicleDrivingFlags.StopForPeds);
            }
        }

        private void ApplyPedPanicReactions(Vector3 center)
        {
            bool dangerPresent = IsDangerNearby(center);
            Ped[] nearby = World.GetNearbyPeds(center, ScanRadius);

            foreach (Ped ped in nearby)
            {
                if (ped == null || !ped.Exists() || ped.IsPlayer || !ped.IsHuman)
                    continue;

                float distToPlayer = ped.Position.DistanceTo(center);
                bool inDangerZone = dangerPresent && distToPlayer <= DangerRadius;

                if (inDangerZone && !_panickedPeds.Contains(ped.Handle))
                {
                    // Trigger a flee reaction away from the player's position.
                    Function.Call(Hash.TASK_SMART_FLEE_COORD, ped, center.X, center.Y, center.Z, 100f, -1, false, false);
                    ped.Task.ClearAll();
                    Function.Call(Hash.TASK_REACT_AND_FLEE_PED, ped, Game.Player.Character);
                    _panickedPeds.Add(ped.Handle);
                }
                else if (!inDangerZone && _panickedPeds.Contains(ped.Handle))
                {
                    // Ped has escaped the danger radius; let default ambient AI resume.
                    _panickedPeds.Remove(ped.Handle);
                }
            }

            // Periodically forget stale handles that no longer correspond to loaded peds.
            _panickedPeds.RemoveWhere(h => !new Ped(h).Exists());
        }

        private bool IsDangerNearby(Vector3 center)
        {
            // Danger = player shooting, or player wanted level active, or a recent explosion nearby.
            bool playerShooting = Game.Player.Character.IsShooting;
            bool wanted = Game.Player.WantedLevel > 0;
            bool explosionNearby = Function.Call<bool>(Hash.IS_EXPLOSION_IN_SPHERE, 0, center.X, center.Y, center.Z, DangerRadius);

            return playerShooting || wanted || explosionNearby;
        }
    }
}
