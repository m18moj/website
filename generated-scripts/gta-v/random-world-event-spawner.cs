/*
 * ScripForge — Random World Event Spawner
 * Pack: GTA V Pack | Category: World
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Ambient random world events (robberies, brawls, breakdowns) spawned near the player on a weighted timer.
 *
 * Written for single-player use via ScriptHookVDotNet — not for GTA Online.
 */

using System;
using System.Collections.Generic;
using System.Linq;
using GTA;
using GTA.Math;
using GTA.Native;

namespace ScripForge.World
{
    /// <summary>
    /// Periodically rolls a weighted table of ambient world events and, if one hits,
    /// spawns it just out of the player's view. Keeps a cooldown so events don't stack
    /// and cleans up finished events after a lifetime expires.
    /// </summary>
    public class RandomWorldEventSpawner : Script
    {
        private class EventDefinition
        {
            public string Name;
            public int Weight;
            public Action<Vector3> Spawn;
        }

        private class ActiveEvent
        {
            public DateTime SpawnedAt;
            public List<Ped> Peds = new List<Ped>();
        }

        private readonly List<EventDefinition> _eventTable = new List<EventDefinition>();
        private readonly List<ActiveEvent> _activeEvents = new List<ActiveEvent>();
        private readonly Random _rng = new Random();

        private DateTime _lastRoll = DateTime.Now;
        private const double RollIntervalSeconds = 45.0;
        private const double SpawnChance = 0.35;
        private const float SpawnDistanceMin = 60f;
        private const float SpawnDistanceMax = 120f;
        private const double EventLifetimeSeconds = 240.0;
        private const int MaxConcurrentEvents = 2;

        public RandomWorldEventSpawner()
        {
            _eventTable.Add(new EventDefinition { Name = "Store Robbery", Weight = 3, Spawn = SpawnStoreRobbery });
            _eventTable.Add(new EventDefinition { Name = "Street Brawl", Weight = 4, Spawn = SpawnStreetBrawl });
            _eventTable.Add(new EventDefinition { Name = "Vehicle Breakdown", Weight = 5, Spawn = SpawnBreakdown });
            Tick += OnTick;
        }

        private void OnTick(object sender, EventArgs e)
        {
            CleanupExpiredEvents();

            if ((DateTime.Now - _lastRoll).TotalSeconds < RollIntervalSeconds)
                return;
            _lastRoll = DateTime.Now;

            if (_activeEvents.Count >= MaxConcurrentEvents || _rng.NextDouble() > SpawnChance)
                return;

            EventDefinition chosen = RollWeightedEvent();
            chosen?.Spawn(GetOffscreenSpawnPoint());
        }

        private EventDefinition RollWeightedEvent()
        {
            int totalWeight = _eventTable.Sum(ev => ev.Weight);
            int roll = _rng.Next(totalWeight);
            int cumulative = 0;

            foreach (EventDefinition ev in _eventTable)
            {
                cumulative += ev.Weight;
                if (roll < cumulative)
                    return ev;
            }
            return _eventTable.Last();
        }

        private Vector3 GetOffscreenSpawnPoint()
        {
            Vector3 playerPos = Game.Player.Character.Position;
            float distance = SpawnDistanceMin + (float)_rng.NextDouble() * (SpawnDistanceMax - SpawnDistanceMin);
            float angle = (float)(_rng.NextDouble() * Math.PI * 2);
            Vector3 candidate = playerPos + new Vector3((float)Math.Cos(angle) * distance, (float)Math.Sin(angle) * distance, 0f);

            var groundZ = new OutputArgument();
            bool found = Function.Call<bool>(Hash.GET_GROUND_Z_FOR_3D_COORD, candidate.X, candidate.Y, 1000f, groundZ, false, false);
            candidate.Z = found ? groundZ.GetResult<float>() : playerPos.Z;
            return candidate;
        }

        private void SpawnStoreRobbery(Vector3 pos)
        {
            var ev = new ActiveEvent { SpawnedAt = DateTime.Now };
            Ped robber = SpawnPed("g_m_y_lost_01", pos);
            if (robber != null)
            {
                robber.Weapons.Give(WeaponHash.Pistol, 50, true, true);
                ev.Peds.Add(robber);
            }
            _activeEvents.Add(ev);
            GTA.UI.Notification.PostTicker("~r~A robbery is happening nearby.~w~", false);
        }

        private void SpawnStreetBrawl(Vector3 pos)
        {
            var ev = new ActiveEvent { SpawnedAt = DateTime.Now };
            Ped brawlerA = SpawnPed("a_m_y_skater_01", pos);
            Ped brawlerB = SpawnPed("a_m_y_skater_01", pos + new Vector3(1.5f, 0f, 0f));

            if (brawlerA != null && brawlerB != null)
            {
                Function.Call(Hash.TASK_COMBAT_PED, brawlerA, brawlerB, 0, 16);
                Function.Call(Hash.TASK_COMBAT_PED, brawlerB, brawlerA, 0, 16);
                ev.Peds.Add(brawlerA);
                ev.Peds.Add(brawlerB);
            }
            _activeEvents.Add(ev);
            GTA.UI.Notification.PostTicker("~o~A fight has broken out nearby.~w~", false);
        }

        private void SpawnBreakdown(Vector3 pos)
        {
            var ev = new ActiveEvent { SpawnedAt = DateTime.Now };
            Model carModel = new Model("blista");
            carModel.Request(1000);

            if (carModel.IsInCdImage && carModel.IsValid)
            {
                Vehicle car = World.CreateVehicle(carModel, pos);
                if (car != null)
                {
                    car.EngineHealth = 0f;
                    car.IsEngineRunning = false;
                    Ped driver = SpawnPed("a_m_m_business_01", pos);
                    if (driver != null)
                    {
                        driver.SetIntoVehicle(car, VehicleSeat.Driver);
                        ev.Peds.Add(driver);
                    }
                }
            }
            carModel.MarkAsNoLongerNeeded();
            _activeEvents.Add(ev);
            GTA.UI.Notification.PostTicker("~w~A motorist is stranded with a broken-down car nearby.", false);
        }

        private Ped SpawnPed(string modelName, Vector3 pos)
        {
            Model model = new Model(modelName);
            model.Request(1000);
            Ped ped = model.IsInCdImage && model.IsValid ? World.CreatePed(model, pos) : null;
            model.MarkAsNoLongerNeeded();
            return ped;
        }

        private void CleanupExpiredEvents()
        {
            for (int i = _activeEvents.Count - 1; i >= 0; i--)
            {
                ActiveEvent ev = _activeEvents[i];
                if ((DateTime.Now - ev.SpawnedAt).TotalSeconds < EventLifetimeSeconds)
                    continue;

                foreach (Ped ped in ev.Peds)
                {
                    if (ped != null && ped.Exists())
                        ped.MarkAsNoLongerNeeded();
                }
                _activeEvents.RemoveAt(i);
            }
        }
    }
}
