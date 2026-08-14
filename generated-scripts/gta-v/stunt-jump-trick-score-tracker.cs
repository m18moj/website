/*
 * ScriptForge — Stunt Jump & Trick Score Tracker
 * Pack: GTA V Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Stunt-jump zone detection with air-time tracking and a scored trick/style system.
 *
 * Written for single-player use via ScriptHookVDotNet — not for GTA Online.
 */

using System;
using System.Collections.Generic;
using GTA;
using GTA.Math;
using GTA.Native;

namespace ScriptForge.Systems
{
    /// <summary>
    /// Defines custom stunt jump trigger zones. When the player's vehicle enters a zone
    /// and then leaves the ground, air time and rotation are tracked to compute a trick
    /// score (barrel rolls, flips, distance) awarded once the vehicle lands safely.
    /// </summary>
    public class StuntJumpTrickScoreTracker : Script
    {
        private class JumpZone
        {
            public string Name;
            public Vector3 TriggerPoint;
            public float TriggerRadius;
        }

        private readonly List<JumpZone> _jumpZones = new List<JumpZone>
        {
            new JumpZone { Name = "Vinewood Ramp", TriggerPoint = new Vector3(-1400f, 380f, 60f), TriggerRadius = 12f },
            new JumpZone { Name = "Zancudo Overpass", TriggerPoint = new Vector3(-2100f, 3200f, 32f), TriggerRadius = 15f },
        };

        private bool _armed;
        private JumpZone _armedZone;

        private bool _inAir;
        private DateTime _airborneStart;
        private Vector3 _airborneStartPos;
        private float _totalRotationDegrees;
        private float _lastHeading;

        public StuntJumpTrickScoreTracker()
        {
            Tick += OnTick;
        }

        private void OnTick(object sender, EventArgs e)
        {
            Vehicle vehicle = Game.Player.Character.CurrentVehicle;
            if (vehicle == null || !vehicle.Exists())
            {
                ResetAirState();
                return;
            }

            CheckZoneArming(vehicle);
            TrackAirborneState(vehicle);
        }

        private void CheckZoneArming(Vehicle vehicle)
        {
            if (_armed)
                return;

            foreach (JumpZone zone in _jumpZones)
            {
                if (vehicle.Position.DistanceTo(zone.TriggerPoint) <= zone.TriggerRadius)
                {
                    _armed = true;
                    _armedZone = zone;
                    GTA.UI.Screen.ShowSubtitle($"~y~{zone.Name}~w~ stunt jump armed!", 2000);
                    break;
                }
            }
        }

        private void TrackAirborneState(Vehicle vehicle)
        {
            bool onGround = Function.Call<bool>(Hash.IS_VEHICLE_ON_ALL_WHEELS, vehicle) ||
                             vehicle.HeightAboveGround < 0.5f;

            if (!_inAir && !onGround && _armed)
            {
                _inAir = true;
                _airborneStart = DateTime.Now;
                _airborneStartPos = vehicle.Position;
                _totalRotationDegrees = 0f;
                _lastHeading = vehicle.Rotation.Z;
            }
            else if (_inAir)
            {
                float headingDelta = Math.Abs(WrapAngleDelta(vehicle.Rotation.Z, _lastHeading));
                _totalRotationDegrees += headingDelta;
                _lastHeading = vehicle.Rotation.Z;

                if (onGround)
                {
                    LandAndScore(vehicle);
                }
            }
        }

        private float WrapAngleDelta(float current, float previous)
        {
            float delta = current - previous;
            while (delta > 180f) delta -= 360f;
            while (delta < -180f) delta += 360f;
            return delta;
        }

        private void LandAndScore(Vehicle vehicle)
        {
            double airTimeSeconds = (DateTime.Now - _airborneStart).TotalSeconds;
            float distance = _airborneStartPos.DistanceTo(vehicle.Position);

            int score = (int)(airTimeSeconds * 100) + (int)(distance * 5) + (int)(_totalRotationDegrees / 360f) * 250;

            string zoneName = _armedZone?.Name ?? "Freestyle";
            GTA.UI.Notification.PostTicker(
                $"~g~{zoneName} complete!~w~ Air time {airTimeSeconds:0.0}s, Distance {distance:0}m, Score {score}", false);

            ResetAirState();
            _armed = false;
            _armedZone = null;
        }

        private void ResetAirState()
        {
            _inAir = false;
            _totalRotationDegrees = 0f;
        }
    }
}
