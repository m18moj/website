/*
 * ScripForge — Emergency Services Response AI
 * Pack: GTA V Pack | Category: AI
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Ambulance/fire crew dispatch AI that responds to nearby player-caused incidents with priority routing.
 *
 * Written for single-player use via ScriptHookVDotNet — not for GTA Online.
 */

using System;
using System.Collections.Generic;
using GTA;
using GTA.Math;
using GTA.Native;
using GTA.UI;

namespace ScripForge.AI
{
    internal enum IncidentType
    {
        Injury,
        Fire,
    }

    internal class Incident
    {
        public IncidentType Type;
        public Vector3 Position;
        public int Priority; // 1 (minor) - 3 (critical)
        public DateTime ReportedAt;
        public bool Dispatched;

        public Incident(IncidentType type, Vector3 position, int priority)
        {
            Type = type;
            Position = position;
            Priority = priority;
            ReportedAt = DateTime.Now;
            Dispatched = false;
        }
    }

    /// <summary>
    /// Watches for player-caused injuries and vehicle fires nearby, queues them as incidents with
    /// a priority score, and dispatches the closest available ambulance or fire crew to the
    /// highest-priority incident first. Crews despawn once they've serviced the scene.
    /// </summary>
    public class EmergencyServicesResponseAI : Script
    {
        private readonly List<Incident> _incidentQueue = new List<Incident>();
        private readonly List<Ped> _activeCrews = new List<Ped>();

        private const float DetectionRadius = 60f;
        private const int MaxActiveCrews = 3;

        private DateTime _nextScan = DateTime.MinValue;
        private DateTime _nextDispatch = DateTime.MinValue;

        public EmergencyServicesResponseAI()
        {
            Tick += OnTick;
        }

        private void OnTick(object sender, EventArgs e)
        {
            if (DateTime.Now >= _nextScan)
            {
                _nextScan = DateTime.Now.AddSeconds(2);
                ScanForIncidents();
            }

            if (DateTime.Now >= _nextDispatch)
            {
                _nextDispatch = DateTime.Now.AddSeconds(3);
                DispatchNextIncident();
            }

            PruneFinishedCrews();
        }

        private void ScanForIncidents()
        {
            Vector3 playerPos = Game.Player.Character.Position;

            // Injured, non-dead peds nearby become an "Injury" incident.
            Ped[] peds = World.GetNearbyPeds(playerPos, DetectionRadius);
            foreach (Ped ped in peds)
            {
                if (ped == null || !ped.Exists() || ped.IsDead)
                    continue;

                if (ped.Health < ped.MaxHealth * 0.4f && !AlreadyQueued(ped.Position, IncidentType.Injury))
                {
                    int priority = ped.Health < ped.MaxHealth * 0.15f ? 3 : 2;
                    _incidentQueue.Add(new Incident(IncidentType.Injury, ped.Position, priority));
                }
            }

            // Burning vehicles nearby become a "Fire" incident.
            Vehicle[] vehicles = World.GetNearbyVehicles(playerPos, DetectionRadius);
            foreach (Vehicle veh in vehicles)
            {
                if (veh == null || !veh.Exists())
                    continue;

                if (veh.IsOnFire && !AlreadyQueued(veh.Position, IncidentType.Fire))
                {
                    _incidentQueue.Add(new Incident(IncidentType.Fire, veh.Position, 3));
                }
            }

            // Drop stale unresolved incidents after two minutes so the queue doesn't grow forever.
            _incidentQueue.RemoveAll(i => !i.Dispatched && (DateTime.Now - i.ReportedAt).TotalSeconds > 120);
        }

        private bool AlreadyQueued(Vector3 pos, IncidentType type)
        {
            foreach (var incident in _incidentQueue)
            {
                if (incident.Type == type && incident.Position.DistanceTo(pos) < 5f)
                    return true;
            }
            return false;
        }

        private void DispatchNextIncident()
        {
            if (_activeCrews.Count >= MaxActiveCrews)
                return;

            Incident best = null;
            foreach (var incident in _incidentQueue)
            {
                if (incident.Dispatched)
                    continue;

                if (best == null || incident.Priority > best.Priority ||
                    (incident.Priority == best.Priority && incident.ReportedAt < best.ReportedAt))
                {
                    best = incident;
                }
            }

            if (best == null)
                return;

            best.Dispatched = true;
            SpawnAndRouteCrew(best);
        }

        private void SpawnAndRouteCrew(Incident incident)
        {
            bool isFire = incident.Type == IncidentType.Fire;
            VehicleHash vehicleModel = isFire ? VehicleHash.FireTruk : VehicleHash.Ambulance;
            PedHash crewModel = isFire ? PedHash.Fireman01SMY : PedHash.Paramedic01SMM;

            Vector3 spawnPos = incident.Position + new Vector3(15f, 15f, 0f);

            Model vModel = new Model(vehicleModel);
            Model pModel = new Model(crewModel);
            vModel.Request(1000);
            pModel.Request(1000);

            if (!vModel.IsLoaded || !pModel.IsLoaded)
                return;

            Vehicle crewVehicle = World.CreateVehicle(vModel, spawnPos);
            if (crewVehicle == null || !crewVehicle.Exists())
                return;

            crewVehicle.IsPersistent = true;
            Function.Call(Hash.SET_VEHICLE_SIREN, crewVehicle, true);

            Ped crew = crewVehicle.CreatePedOnSeat(VehicleSeat.Driver, pModel);
            crew.IsPersistent = true;
            Function.Call(Hash.TASK_VEHICLE_DRIVE_TO_COORD_LONGRANGE, crew, crewVehicle,
                incident.Position.X, incident.Position.Y, incident.Position.Z, 25f, 1, (uint)vehicleModel, 786603, 5f, true);

            _activeCrews.Add(crew);

            string kind = isFire ? "Fire crew" : "Ambulance";
            Notification.PostTicker(string.Format("~b~{0} dispatched (priority {1}).", kind, incident.Priority), false);

            vModel.MarkAsNoLongerNeeded();
            pModel.MarkAsNoLongerNeeded();
        }

        private void PruneFinishedCrews()
        {
            _activeCrews.RemoveAll(c => c == null || !c.Exists() || c.IsDead);
        }
    }
}
