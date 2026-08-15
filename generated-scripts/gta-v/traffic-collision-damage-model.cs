/*
 * ScripForge — Traffic Collision & Damage Model
 * Pack: GTA V Pack | Category: Vehicles
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Vehicle-to-vehicle and vehicle-to-pedestrian collision damage scaling with speed-based crumple effects.
 *
 * Written for single-player use via ScriptHookVDotNet — not for GTA Online.
 */

using System;
using System.Collections.Generic;
using GTA;
using GTA.Math;
using GTA.Native;
using GTA.UI;

namespace ScripForge.Vehicles
{
    /// <summary>
    /// Watches nearby vehicles the player collides with (or witnesses colliding) and applies
    /// extra body damage scaled by closing speed, plus a lightweight "crumple" nudge to the
    /// vehicle's deformation so hard hits look and feel worse than the base game's damage model.
    /// </summary>
    public class TrafficCollisionDamageModel : Script
    {
        private readonly Dictionary<int, float> _lastKnownSpeed = new Dictionary<int, float>();
        private readonly HashSet<int> _recentlyCrumpled = new HashSet<int>();
        private DateTime _nextSweep = DateTime.MinValue;

        private const float SweepRadius = 40f;
        private const float MinCrumpleSpeed = 12f; // m/s, roughly 27mph
        private const float PedestrianKnockdownSpeed = 6f;

        public TrafficCollisionDamageModel()
        {
            Tick += OnTick;
        }

        private void OnTick(object sender, EventArgs e)
        {
            if (DateTime.Now < _nextSweep)
                return;

            _nextSweep = DateTime.Now.AddMilliseconds(250);

            Vector3 playerPos = Game.Player.Character.Position;
            Vehicle[] nearby = World.GetNearbyVehicles(playerPos, SweepRadius);

            foreach (Vehicle veh in nearby)
            {
                if (veh == null || !veh.Exists())
                    continue;

                TrackAndEvaluate(veh);
            }

            PruneStaleEntries(nearby);
        }

        private void TrackAndEvaluate(Vehicle veh)
        {
            int handle = veh.Handle;
            float currentSpeed = veh.Speed;

            if (!_lastKnownSpeed.TryGetValue(handle, out float prevSpeed))
            {
                _lastKnownSpeed[handle] = currentSpeed;
                return;
            }

            float speedDrop = prevSpeed - currentSpeed;
            _lastKnownSpeed[handle] = currentSpeed;

            // A sudden, large speed loss with no braking input is our proxy for "just hit something".
            bool isBraking = veh.IsEngineRunning && Function.Call<bool>(Hash.IS_VEHICLE_HANDBRAKE_ON, veh) == false
                && veh.Driver != null && veh.Driver.Exists() && veh.Driver.IsPlayer
                && Game.IsControlPressed(GTA.Control.VehicleBrake);

            if (speedDrop < 10f || isBraking)
                return;

            ApplyCollisionDamage(veh, speedDrop);
            CheckPedestrianImpact(veh, speedDrop);
        }

        private void ApplyCollisionDamage(Vehicle veh, float speedDrop)
        {
            int handle = veh.Handle;
            if (_recentlyCrumpled.Contains(handle))
                return;

            if (speedDrop < MinCrumpleSpeed)
                return;

            // Scale extra engine/body damage with how violent the speed loss was.
            float severity = Math.Min(1.0f, speedDrop / 40f);
            float healthLoss = severity * 400f;

            veh.EngineHealth = Math.Max(0f, veh.EngineHealth - healthLoss);
            veh.BodyHealth = Math.Max(0f, veh.BodyHealth - healthLoss * 0.6f);

            // Nudge the deformation mesh at the front of the vehicle to visually sell a crumple.
            Vector3 frontOffset = veh.ForwardVector * 1.5f;
            Function.Call(Hash.SET_VEHICLE_DAMAGE, veh, frontOffset.X, frontOffset.Y, frontOffset.Z, healthLoss * 0.5f, healthLoss, true);
            Function.Call(Hash.SET_VEHICLE_ENGINE_CAN_DEGRADE, veh, true);

            if (severity > 0.6f)
            {
                Function.Call(Hash.SET_VEHICLE_TYRE_BURST, veh, 0, false, 1000f);
                Function.Call(Hash.SET_VEHICLE_TYRE_BURST, veh, 1, false, 1000f);
            }

            _recentlyCrumpled.Add(handle);

            if (veh.Driver != null && veh.Driver.Exists() && veh.Driver.IsPlayer)
            {
                Notification.PostTicker(string.Format("~r~Impact damage: -{0} engine, -{1} body", (int)healthLoss, (int)(healthLoss * 0.6f)), false);
            }
        }

        private void CheckPedestrianImpact(Vehicle veh, float speedDrop)
        {
            if (speedDrop < PedestrianKnockdownSpeed)
                return;

            Ped[] peds = World.GetNearbyPeds(veh.Position, 3.5f);
            foreach (Ped ped in peds)
            {
                if (ped == null || !ped.Exists() || ped.IsInVehicle())
                    continue;

                float distance = ped.Position.DistanceTo(veh.Position);
                if (distance > 3.0f)
                    continue;

                // Ragdoll the pedestrian and apply injury damage proportional to impact speed.
                float impactDamage = Math.Min(150f, speedDrop * 4f);
                ped.ApplyDamage((int)impactDamage);
                Function.Call(Hash.SET_PED_TO_RAGDOLL, ped, 1500, 2000, 0, true, true, false);
            }
        }

        private void PruneStaleEntries(Vehicle[] stillNearby)
        {
            var validHandles = new HashSet<int>();
            foreach (Vehicle v in stillNearby)
            {
                if (v != null && v.Exists())
                    validHandles.Add(v.Handle);
            }

            var toRemove = new List<int>();
            foreach (int handle in _lastKnownSpeed.Keys)
            {
                if (!validHandles.Contains(handle))
                    toRemove.Add(handle);
            }

            foreach (int handle in toRemove)
            {
                _lastKnownSpeed.Remove(handle);
                _recentlyCrumpled.Remove(handle);
            }
        }
    }
}
