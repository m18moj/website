/*
 * ScripForge — Garage & Vehicle Storage Manager
 * Pack: GTA V Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Owned-vehicle garage storage with retrieval, valet delivery, and impound recovery flows.
 *
 * Written for single-player use via ScriptHookVDotNet — not for GTA Online.
 */

using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows.Forms;
using GTA;
using GTA.Math;
using GTA.Native;

namespace ScripForge.Systems
{
    /// <summary>
    /// Tracks a roster of owned vehicles across multiple garages, allows storing the
    /// current vehicle, retrieving stored vehicles by valet delivery, and recovering
    /// impounded vehicles for a fee.
    /// </summary>
    public class GarageVehicleStorageManager : Script
    {
        private class StoredVehicle
        {
            public string Model;
            public string Plate;
            public string GarageName;
            public bool IsImpounded;
        }

        private readonly List<StoredVehicle> _fleet = new List<StoredVehicle>();

        private readonly Dictionary<string, Vector3> _garages = new Dictionary<string, Vector3>
        {
            { "Vinewood Hills Garage", new Vector3(-24.0f, 542.0f, 174.0f) },
            { "Del Perro Garage", new Vector3(-1370.0f, -600.0f, 27.0f) },
        };

        private const float InteractionRadius = 6f;
        private const int ImpoundFee = 750;
        private DateTime _lastPrompt = DateTime.MinValue;

        public GarageVehicleStorageManager()
        {
            Tick += OnTick;
            KeyDown += OnKeyDown;
        }

        private void OnTick(object sender, EventArgs e)
        {
            Vector3 playerPos = Game.Player.Character.Position;

            foreach (var kvp in _garages)
            {
                float dist = playerPos.DistanceTo(kvp.Value);
                if (dist <= InteractionRadius && (DateTime.Now - _lastPrompt).TotalSeconds > 3)
                {
                    _lastPrompt = DateTime.Now;
                    GTA.UI.Screen.ShowSubtitle($"~y~{kvp.Key}~w~: Press ~b~G~w~ to store/retrieve vehicles.", 2500);
                }
            }
        }

        private void OnKeyDown(object sender, KeyEventArgs e)
        {
            if (e.KeyCode != Keys.G)
                return;

            Vector3 playerPos = Game.Player.Character.Position;
            string nearestGarage = _garages
                .Where(g => playerPos.DistanceTo(g.Value) <= InteractionRadius)
                .Select(g => g.Key)
                .FirstOrDefault();

            if (nearestGarage == null)
                return;

            Vehicle currentVehicle = Game.Player.Character.CurrentVehicle;
            if (currentVehicle != null && currentVehicle.Exists() && currentVehicle.Driver == Game.Player.Character)
            {
                StoreVehicle(currentVehicle, nearestGarage);
            }
            else
            {
                RetrieveFromGarage(nearestGarage);
            }
        }

        private void StoreVehicle(Vehicle vehicle, string garageName)
        {
            var record = new StoredVehicle
            {
                Model = vehicle.DisplayName,
                Plate = vehicle.NumberPlate,
                GarageName = garageName,
                IsImpounded = false,
            };
            _fleet.Add(record);

            vehicle.MarkAsNoLongerNeeded();
            vehicle.Delete();

            GTA.UI.Notification.PostTicker($"Stored {record.Model} at {garageName}.", false);
        }

        private void RetrieveFromGarage(string garageName)
        {
            StoredVehicle stored = _fleet.FirstOrDefault(v => v.GarageName == garageName && !v.IsImpounded);
            if (stored == null)
            {
                GTA.UI.Notification.PostTicker("No vehicles stored at this garage.", false);
                return;
            }

            SpawnVehicleForPlayer(stored);
            _fleet.Remove(stored);
        }

        private void SpawnVehicleForPlayer(StoredVehicle stored)
        {
            Vector3 spawnPos = Game.Player.Character.Position + Game.Player.Character.ForwardVector * 5f;
            Model model = new Model(stored.Model);
            model.Request(1000);

            if (!model.IsInCdImage || !model.IsValid)
            {
                GTA.UI.Notification.PostTicker("Vehicle model failed to load for retrieval.", false);
                return;
            }

            Vehicle vehicle = World.CreateVehicle(model, spawnPos);
            if (vehicle != null)
            {
                vehicle.NumberPlate = stored.Plate;
                GTA.UI.Notification.PostTicker($"Valet delivered your {stored.Model}.", false);
            }
            model.MarkAsNoLongerNeeded();
        }

        /// <summary>
        /// Call this when a vehicle owned by the player is confirmed destroyed/impounded by
        /// police pursuit logic elsewhere, to mark it recoverable via impound lot instead of lost.
        /// </summary>
        public void MarkImpounded(string plate)
        {
            StoredVehicle stored = _fleet.FirstOrDefault(v => v.Plate == plate);
            if (stored != null)
                stored.IsImpounded = true;
        }

        /// <summary>Recovers an impounded vehicle for a cash fee, deducted via native money funcs.</summary>
        public bool RecoverFromImpound(string plate)
        {
            StoredVehicle stored = _fleet.FirstOrDefault(v => v.Plate == plate && v.IsImpounded);
            if (stored == null)
                return false;

            int cash = Function.Call<int>(Hash.GET_PLAYER_MONEY, Game.Player, 0);
            if (cash < ImpoundFee)
            {
                GTA.UI.Notification.PostTicker("Not enough cash to recover impounded vehicle.", false);
                return false;
            }

            Function.Call(Hash.SET_PLAYER_MONEY, Game.Player, cash - ImpoundFee, 0);
            stored.IsImpounded = false;
            SpawnVehicleForPlayer(stored);
            _fleet.Remove(stored);
            return true;
        }
    }
}
