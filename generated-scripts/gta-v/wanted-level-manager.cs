/*
 * ScripForge — Wanted Level & Heat Decay
 * Pack: GTA V Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Custom heat model that decays wanted level over time based on line-of-sight loss and hideout cooldowns.
 *
 * Written for single-player use via ScriptHookVDotNet — not for GTA Online.
 */

using System;
using System.Collections.Generic;
using GTA;
using GTA.Math;
using GTA.Native;

namespace ScripForge.Systems
{
    /// <summary>
    /// Replaces the vanilla "fade out of the search radius" evasion model with a heat
    /// meter that only decays once no police units have line-of-sight on the player,
    /// plus faster cooldown while parked inside a designated hideout zone.
    /// </summary>
    public class WantedLevelManager : Script
    {
        private float _heat;                  // 0-500, mapped to 0-5 stars
        private DateTime _lastSeenByPolice = DateTime.MinValue;
        private const float LosGraceSeconds = 12f;   // time with no LOS before heat starts dropping
        private const float DecayPerSecond = 8f;
        private const float HideoutDecayMultiplier = 3.0f;

        private readonly List<Vector3> _hideoutZones = new List<Vector3>
        {
            new Vector3(-1150.0f, -1520.0f, 4.4f), // safehouse example
            new Vector3(1980.0f, 3055.0f, 47.2f),  // rural hideout example
        };
        private const float HideoutRadius = 20f;

        public WantedLevelManager()
        {
            Game.MaxWantedLevel = 5;
            Tick += OnTick;
        }

        private void OnTick(object sender, EventArgs e)
        {
            SyncHeatFromNativeWantedLevel();
            UpdateLineOfSightState();
            ApplyDecay();
            PushHeatToNativeWantedLevel();
        }

        private void SyncHeatFromNativeWantedLevel()
        {
            // If the game raises wanted level (e.g. new crime), pull that up into our heat meter
            // instead of fighting it, so crimes still register instantly.
            int nativeStars = Game.Player.WantedLevel;
            float nativeHeatFloor = nativeStars * 100f;
            if (nativeHeatFloor > _heat)
                _heat = nativeHeatFloor;
        }

        private void UpdateLineOfSightState()
        {
            if (_heat <= 0f)
                return;

            bool seen = IsPlayerSeenByAnyCop();
            if (seen)
                _lastSeenByPolice = DateTime.Now;
        }

        private bool IsPlayerSeenByAnyCop()
        {
            Ped player = Game.Player.Character;
            Ped[] nearbyPeds = World.GetNearbyPeds(player, 80f);

            foreach (Ped ped in nearbyPeds)
            {
                if (ped == null || !ped.Exists() || ped.IsDead)
                    continue;

                if (!Function.Call<bool>(Hash.IS_PED_A_COP, ped))
                    continue;

                bool hasLos = Function.Call<bool>(Hash.HAS_ENTITY_CLEAR_LOS_TO_ENTITY, ped, player, 17);
                if (hasLos)
                    return true;
            }
            return false;
        }

        private bool IsInHideoutZone(Vector3 pos)
        {
            foreach (Vector3 zone in _hideoutZones)
            {
                if (pos.DistanceTo(zone) <= HideoutRadius)
                    return true;
            }
            return false;
        }

        private void ApplyDecay()
        {
            if (_heat <= 0f)
                return;

            double secondsSinceSeen = (DateTime.Now - _lastSeenByPolice).TotalSeconds;
            if (secondsSinceSeen < LosGraceSeconds)
                return; // still within grace window — cops "remember" recent sighting

            float decay = DecayPerSecond * Game.LastFrameTime;

            if (IsInHideoutZone(Game.Player.Character.Position))
            {
                decay *= HideoutDecayMultiplier;
            }

            _heat = Math.Max(0f, _heat - decay);
        }

        private void PushHeatToNativeWantedLevel()
        {
            int targetStars = (int)Math.Ceiling(_heat / 100f);
            targetStars = Math.Max(0, Math.Min(5, targetStars));

            if (Game.Player.WantedLevel != targetStars)
            {
                Game.Player.WantedLevel = targetStars;
            }

            if (targetStars == 0)
            {
                Function.Call(Hash.CLEAR_PLAYER_WANTED_LEVEL, Game.Player);
            }
        }
    }
}
