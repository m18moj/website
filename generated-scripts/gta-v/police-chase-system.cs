/*
 * ScripForge — Wanted Chase & Roadblock AI
 * Pack: GTA V Pack | Category: AI
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Escalates pursuit intensity with wanted level, spawning spike strips and roadblocks ahead of the player.
 *
 * Written for single-player use via ScriptHookVDotNet — not for GTA Online.
 */

using System;
using System.Collections.Generic;
using GTA;
using GTA.Math;
using GTA.Native;

namespace ScripForge.AI
{
    /// <summary>
    /// Watches the player's wanted level and periodically escalates the chase by spawning
    /// roadblocks and spike strips ahead of the player's direction of travel.
    /// </summary>
    public class PoliceChaseSystem : Script
    {
        private readonly List<Vehicle> _spawnedRoadblocks = new List<Vehicle>();
        private readonly List<Prop> _spawnedSpikeStrips = new List<Prop>();
        private DateTime _nextEscalation = DateTime.MinValue;
        private int _lastWantedLevel;

        // Roughly how many extra roadblocks/spikes to throw at the player per star level.
        private const int MaxUnitsPerEscalation = 2;

        public PoliceChaseSystem()
        {
            Tick += OnTick;
            Aborted += (s, e) => CleanupAll();
        }

        private void OnTick(object sender, EventArgs e)
        {
            Player player = Game.Player;
            int wanted = player.WantedLevel;

            if (wanted == 0)
            {
                if (_lastWantedLevel > 0)
                    CleanupAll(); // player evaded — clear leftover units
                _lastWantedLevel = 0;
                return;
            }

            _lastWantedLevel = wanted;

            if (DateTime.Now < _nextEscalation)
                return;

            // Escalation cadence shortens as wanted level rises (more frequent pressure).
            double cooldownSeconds = Math.Max(6.0, 20.0 - wanted * 3.0);
            _nextEscalation = DateTime.Now.AddSeconds(cooldownSeconds);

            if (wanted >= 2)
                SpawnRoadblockAhead(wanted);

            if (wanted >= 3)
                SpawnSpikeStripAhead();

            PruneStaleUnits();
        }

        private void SpawnRoadblockAhead(int wanted)
        {
            Ped player = Game.Player.Character;
            if (!player.IsInVehicle())
                return;

            Vehicle playerVeh = player.CurrentVehicle;
            Vector3 forward = playerVeh.ForwardVector;
            Vector3 spawnPos = playerVeh.Position + forward * 80f;

            float roadHeading;
            Vector3 roadPos;
            Function.Call<Vector3>(Hash.GET_NTH_CLOSEST_VEHICLE_NODE, spawnPos.X, spawnPos.Y, spawnPos.Z, 1);
            roadPos = spawnPos; // approximate placement on nearest road segment
            roadHeading = playerVeh.Heading;

            int unitCount = Math.Min(MaxUnitsPerEscalation, wanted - 1);
            for (int i = 0; i < unitCount; i++)
            {
                Vector3 offset = roadPos + playerVeh.RightVector * (i * 4f - 2f);
                Model copModel = new Model(VehicleHash.Police2);
                copModel.Request(500);
                if (!copModel.IsLoaded)
                    continue;

                Vehicle cruiser = World.CreateVehicle(copModel, offset, roadHeading + 90f);
                if (cruiser == null || !cruiser.Exists())
                    continue;

                cruiser.IsPersistent = true;
                Ped cop = cruiser.CreatePedOnSeat(VehicleSeat.Driver, PedHash.Cop01SMY);
                cop.Task.FightAgainst(Game.Player.Character);
                Function.Call(Hash.SET_PED_AS_COP, cop, true);

                _spawnedRoadblocks.Add(cruiser);
                copModel.MarkAsNoLongerNeeded();
            }
        }

        private void SpawnSpikeStripAhead()
        {
            Ped player = Game.Player.Character;
            if (!player.IsInVehicle())
                return;

            Vehicle playerVeh = player.CurrentVehicle;
            Vector3 pos = playerVeh.Position + playerVeh.ForwardVector * 45f;

            Model spikeModel = new Model("p_ld_stinger_s");
            spikeModel.Request(500);
            if (!spikeModel.IsLoaded)
                return;

            Prop strip = World.CreateProp(spikeModel, pos, false, false);
            if (strip != null && strip.Exists())
            {
                strip.Heading = playerVeh.Heading + 90f;
                _spawnedSpikeStrips.Add(strip);
                Notification.PostTicker("~r~Spike strip deployed ahead!", false);
            }
            spikeModel.MarkAsNoLongerNeeded();
        }

        private void PruneStaleUnits()
        {
            // Remove references to units that have been destroyed or wandered too far off.
            _spawnedRoadblocks.RemoveAll(v => v == null || !v.Exists() || v.IsDead);
            _spawnedSpikeStrips.RemoveAll(p => p == null || !p.Exists());
        }

        private void CleanupAll()
        {
            foreach (var v in _spawnedRoadblocks)
            {
                if (v != null && v.Exists())
                    v.MarkAsNoLongerNeeded();
            }
            foreach (var p in _spawnedSpikeStrips)
            {
                if (p != null && p.Exists())
                    p.Delete();
            }
            _spawnedRoadblocks.Clear();
            _spawnedSpikeStrips.Clear();
        }
    }
}
