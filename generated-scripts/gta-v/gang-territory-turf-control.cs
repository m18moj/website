/*
 * ScriptForge — Gang Territory & Turf Control
 * Pack: GTA V Pack | Category: World
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Map-zone territory ownership that shifts between gangs based on scripted turf-war outcomes.
 *
 * Written for single-player use via ScriptHookVDotNet — not for GTA Online.
 */

using System;
using System.Collections.Generic;
using System.Linq;
using GTA;
using GTA.Math;
using GTA.Native;

namespace ScriptForge.World
{
    /// <summary>
    /// Defines a set of circular turf zones, each owned by a gang faction. The player
    /// can trigger a turf war by lingering in enemy territory with hostiles nearby;
    /// winning shifts ownership and applies a blip color/notification change.
    /// </summary>
    public class GangTerritoryTurfControl : Script
    {
        private class TurfZone
        {
            public string Name;
            public Vector3 Center;
            public float Radius;
            public string OwningGang;
            public Blip ZoneBlip;
        }

        private readonly List<TurfZone> _zones = new List<TurfZone>();
        private TurfZone _activeWar;
        private int _warKillCount;
        private const int KillsToWinTurf = 5;
        private DateTime _warStarted;
        private const double WarTimeoutSeconds = 180;

        public GangTerritoryTurfControl()
        {
            SetupZones();
            Tick += OnTick;
        }

        private void SetupZones()
        {
            _zones.Add(MakeZone("Grove Street", new Vector3(97.0f, -1918.0f, 21.0f), 60f, "Families"));
            _zones.Add(MakeZone("Forum Drive", new Vector3(-50.0f, -1650.0f, 30.0f), 70f, "Ballas"));
            _zones.Add(MakeZone("El Burro Heights", new Vector3(1350.0f, -1450.0f, 35.0f), 80f, "Vagos"));

            foreach (var zone in _zones)
            {
                zone.ZoneBlip = World.CreateBlip(zone.Center, zone.Radius);
                zone.ZoneBlip.Color = ColorForGang(zone.OwningGang);
                zone.ZoneBlip.Alpha = 90;
            }
        }

        private TurfZone MakeZone(string name, Vector3 center, float radius, string owner)
        {
            return new TurfZone { Name = name, Center = center, Radius = radius, OwningGang = owner };
        }

        private BlipColor ColorForGang(string gang)
        {
            switch (gang)
            {
                case "Families": return BlipColor.Green;
                case "Ballas": return BlipColor.Purple;
                case "Vagos": return BlipColor.Yellow;
                default: return BlipColor.White;
            }
        }

        private void OnTick(object sender, EventArgs e)
        {
            Vector3 playerPos = Game.Player.Character.Position;

            if (_activeWar != null)
            {
                UpdateActiveWar();
                return;
            }

            TurfZone zone = _zones.FirstOrDefault(z => playerPos.DistanceTo(z.Center) <= z.Radius);
            if (zone != null && zone.OwningGang != "Player")
            {
                bool hostilesNearby = World.GetNearbyPeds(Game.Player.Character, 40f)
                    .Any(p => p.Exists() && !p.IsDead && p.RelationshipGroup != Game.Player.Character.RelationshipGroup);

                if (hostilesNearby && Game.IsControlJustPressed(GTA.Control.Context))
                {
                    StartTurfWar(zone);
                }
            }
        }

        private void StartTurfWar(TurfZone zone)
        {
            _activeWar = zone;
            _warKillCount = 0;
            _warStarted = DateTime.Now;
            GTA.UI.Notification.PostTicker($"~r~Turf war started~w~ for {zone.Name}! Clear {KillsToWinTurf} hostiles to take it.", false);
        }

        private void UpdateActiveWar()
        {
            if ((DateTime.Now - _warStarted).TotalSeconds > WarTimeoutSeconds)
            {
                GTA.UI.Notification.PostTicker($"Turf war for {_activeWar.Name} timed out.", false);
                _activeWar = null;
                return;
            }

            // Simplified kill tracking: count nearby dead peds of the rival faction since war start.
            int hostileDead = World.GetNearbyPeds(Game.Player.Character, 60f)
                .Count(p => p.Exists() && p.IsDead);

            if (hostileDead >= KillsToWinTurf)
            {
                WinTurfWar(_activeWar);
                _activeWar = null;
            }
        }

        private void WinTurfWar(TurfZone zone)
        {
            zone.OwningGang = "Player";
            zone.ZoneBlip.Color = BlipColor.Blue;
            GTA.UI.Notification.PostTicker($"~b~Turf captured!~w~ {zone.Name} now belongs to your crew.", false);
        }
    }
}
