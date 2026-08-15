/*
 * ScripForge — Parachute & Skydiving Controller
 * Pack: GTA V Pack | Category: Movement
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Freefall and parachute deployment physics tuning with a landing-quality scoring system.
 *
 * Written for single-player use via ScriptHookVDotNet — not for GTA Online.
 */

using System;
using System.Windows.Forms;
using GTA;
using GTA.Math;
using GTA.Native;

namespace ScripForge.Movement
{
    /// <summary>
    /// Tracks the player's freefall state (falling without a parachute deployed),
    /// gives a manual chute-deploy hotkey with a minimum-altitude safety check, and
    /// scores landings based on descent speed and proximity to a marked target zone.
    /// </summary>
    public class ParachuteSkydivingController : Script
    {
        private bool _inFreefall;
        private DateTime _freefallStart;
        private float _freefallStartHeight;
        private const float MinDeployHeight = 15f;

        private bool _chuteDeployed;
        private Vector3? _targetLandingZone;
        private const float TargetZoneScoreRadius = 25f;

        public ParachuteSkydivingController()
        {
            Tick += OnTick;
            KeyDown += OnKeyDown;
        }

        private void OnKeyDown(object sender, KeyEventArgs e)
        {
            if (e.KeyCode == Keys.C && _inFreefall && !_chuteDeployed)
            {
                TryDeployParachute();
            }
        }

        private void OnTick(object sender, EventArgs e)
        {
            Ped player = Game.Player.Character;

            bool isFalling = Function.Call<bool>(Hash.IS_PED_FALLING, player) ||
                              Function.Call<bool>(Hash.IS_PED_IN_PARACHUTE_FREE_FALL, player);
            bool isParachuting = Function.Call<bool>(Hash.IS_PED_IN_PARACHUTE, player);

            if (isFalling && !_inFreefall)
            {
                StartFreefall(player);
            }
            else if (!isFalling && !isParachuting && _inFreefall)
            {
                EndFreefallTracking(player, landed: true);
            }

            if (isParachuting)
            {
                _chuteDeployed = true;
            }

            if (_inFreefall)
            {
                UpdateFreefallHud(player);
            }
        }

        private void StartFreefall(Ped player)
        {
            _inFreefall = true;
            _chuteDeployed = false;
            _freefallStart = DateTime.Now;
            _freefallStartHeight = player.HeightAboveGround;
        }

        private void TryDeployParachute()
        {
            Ped player = Game.Player.Character;

            if (player.HeightAboveGround < MinDeployHeight)
            {
                GTA.UI.Screen.ShowSubtitle("~r~Too low to deploy!~w~", 1500);
                return;
            }

            Function.Call(Hash.FORCE_PED_TO_OPEN_PARACHUTE, player);
        }

        private void UpdateFreefallHud(Ped player)
        {
            double freefallSeconds = (DateTime.Now - _freefallStart).TotalSeconds;
            GTA.UI.Screen.ShowSubtitle(
                $"Freefall: {freefallSeconds:0.0}s | Height: {player.HeightAboveGround:0}m | Press ~b~C~w~ to deploy chute", 100);
        }

        private void EndFreefallTracking(Ped player, bool landed)
        {
            _inFreefall = false;

            if (!landed)
                return;

            float verticalSpeed = Math.Abs(player.Velocity.Z);
            string landingQuality = ScoreLanding(verticalSpeed, player.Position);

            GTA.UI.Notification.PostTicker($"Landing: {landingQuality}", false);
        }

        private string ScoreLanding(float verticalSpeed, Vector3 landingPos)
        {
            string speedRating;
            if (verticalSpeed < 2f) speedRating = "~g~Perfect Landing~w~";
            else if (verticalSpeed < 5f) speedRating = "~y~Rough Landing~w~";
            else speedRating = "~r~Crash Landing~w~";

            if (_targetLandingZone.HasValue)
            {
                float distance = landingPos.DistanceTo(_targetLandingZone.Value);
                if (distance <= TargetZoneScoreRadius)
                {
                    speedRating += $" (On Target, {distance:0}m off center)";
                }
            }

            return speedRating;
        }

        /// <summary>Sets a scored drop-zone target, e.g. for a skydiving challenge mission.</summary>
        public void SetTargetLandingZone(Vector3 position)
        {
            _targetLandingZone = position;
        }
    }
}
