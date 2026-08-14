/*
 * ScriptForge — Vehicle Handling & Damage Model
 * Pack: GTA V Pack | Category: Vehicles
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Applies per-class grip tuning, crumple-style visual damage, and randomized tire blowouts to the player's current vehicle.
 *
 * Written for single-player use via ScriptHookVDotNet — not for GTA Online.
 */

using System;
using System.Collections.Generic;
using GTA;
using GTA.Math;
using GTA.Native;

namespace ScriptForge.Vehicles
{
    /// <summary>
    /// Overrides default handling behavior per vehicle class and layers on a simple
    /// crumple-damage + tire blowout model driven off collision speed and health loss.
    /// </summary>
    public class DrivingController : Script
    {
        // Grip multipliers keyed by vehicle class, applied via traction modifiers.
        private readonly Dictionary<VehicleClass, float> _classGrip = new Dictionary<VehicleClass, float>
        {
            { VehicleClass.Super, 1.35f },
            { VehicleClass.Sports, 1.20f },
            { VehicleClass.Muscle, 1.05f },
            { VehicleClass.SUV, 0.90f },
            { VehicleClass.Off_Road, 0.80f },
            { VehicleClass.Commercial, 0.65f },
        };

        private Vehicle _lastVehicle;
        private float _lastHealth;
        private readonly Random _rng = new Random();
        private DateTime _nextBlowoutCheck = DateTime.MinValue;

        public DrivingController()
        {
            Tick += OnTick;
            Aborted += (s, e) => RestoreVehicle(_lastVehicle);
        }

        private void OnTick(object sender, EventArgs e)
        {
            Ped player = Game.Player.Character;
            if (player == null || !player.Exists() || !player.IsInVehicle())
            {
                _lastVehicle = null;
                return;
            }

            Vehicle veh = player.CurrentVehicle;
            if (veh == null || !veh.Exists())
                return;

            if (veh != _lastVehicle)
            {
                // Newly entered vehicle: apply class-based grip and reset tracking state.
                ApplyGripForClass(veh);
                _lastVehicle = veh;
                _lastHealth = veh.EngineHealth + veh.BodyHealth;
            }

            HandleCrumpleDamage(veh);
            HandleTireBlowouts(veh);
        }

        private void ApplyGripForClass(Vehicle veh)
        {
            VehicleClass cls = veh.ClassType;
            float grip = _classGrip.ContainsKey(cls) ? _classGrip[cls] : 1.0f;

            // Native handling field modifiers: traction curve max + min, scaled by class grip.
            Function.Call(Hash.SET_VEHICLE_HANDLING_FLOAT, veh, "CHandlingData", "fTractionCurveMax", 2.2f * grip);
            Function.Call(Hash.SET_VEHICLE_HANDLING_FLOAT, veh, "CHandlingData", "fTractionCurveMin", 1.9f * grip);
            Function.Call(Hash.SET_VEHICLE_HANDLING_FLOAT, veh, "CHandlingData", "fTractionBiasFront", 0.5f);
        }

        private void HandleCrumpleDamage(Vehicle veh)
        {
            float currentHealth = veh.EngineHealth + veh.BodyHealth;
            float delta = _lastHealth - currentHealth;

            if (delta > 60f)
            {
                // Large sudden health drop implies a hard impact — force extra deformation
                // by applying additional damage at the point of highest speed loss.
                veh.ApplyDamage(veh.Position, delta * 0.35f, 30f);
                if (currentHealth < 200f)
                {
                    Function.Call(Hash.SET_VEHICLE_ENGINE_ON, veh, currentHealth > 0f, true, true);
                }
            }

            _lastHealth = currentHealth;
        }

        private void HandleTireBlowouts(Vehicle veh)
        {
            if (DateTime.Now < _nextBlowoutCheck)
                return;

            _nextBlowoutCheck = DateTime.Now.AddSeconds(1.5);

            float speed = veh.Speed;
            if (speed < 15f)
                return;

            // Higher speed and lower body health increase blowout probability per check.
            float bodyDamageFactor = 1f - (veh.BodyHealth / 1000f);
            float chance = (speed / 60f) * 0.08f + bodyDamageFactor * 0.05f;

            if (_rng.NextDouble() < chance)
            {
                int wheel = _rng.Next(0, 4);
                Function.Call(Hash.SET_VEHICLE_TYRE_BURST, veh, wheel, false, 1000f);
                Notification.PostTicker("~r~Tire blown at high speed!", false);
            }
        }

        private void RestoreVehicle(Vehicle veh)
        {
            if (veh == null || !veh.Exists())
                return;

            // Reset traction fields to vanilla defaults on script unload.
            Function.Call(Hash.SET_VEHICLE_HANDLING_FLOAT, veh, "CHandlingData", "fTractionCurveMax", 2.2f);
            Function.Call(Hash.SET_VEHICLE_HANDLING_FLOAT, veh, "CHandlingData", "fTractionCurveMin", 1.9f);
        }
    }
}
