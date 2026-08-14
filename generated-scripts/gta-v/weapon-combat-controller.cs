/*
 * ScriptForge — Cover-Based Combat System
 * Pack: GTA V Pack | Category: Combat
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Adds cover snapping, blind-fire toggling, and soft lock-on assist to gunfights near the player.
 *
 * Written for single-player use via ScriptHookVDotNet — not for GTA Online.
 */

using System;
using System.Collections.Generic;
using System.Windows.Forms;
using GTA;
using GTA.Math;
using GTA.Native;

namespace ScriptForge.Combat
{
    /// <summary>
    /// Adds three combat quality-of-life layers on top of default gunplay:
    /// snapping to the nearest low/high cover object, toggled blind-fire while in cover,
    /// and a soft aim-assist that nudges the camera toward the nearest visible hostile.
    /// </summary>
    public class WeaponCombatController : Script
    {
        private bool _inCover;
        private bool _blindFireEnabled;
        private const float CoverSearchRadius = 3.0f;
        private const float LockOnAssistRadius = 40f;
        private const float LockOnConeDegrees = 25f;

        public WeaponCombatController()
        {
            Tick += OnTick;
            KeyDown += OnKeyDown;
        }

        private void OnKeyDown(object sender, KeyEventArgs e)
        {
            if (e.KeyCode == Keys.C)
            {
                TryEnterOrExitCover();
            }
            else if (e.KeyCode == Keys.B && _inCover)
            {
                ToggleBlindFire();
            }
        }

        private void OnTick(object sender, EventArgs e)
        {
            Ped player = Game.Player.Character;
            if (player == null || !player.Exists() || player.IsDead)
                return;

            UpdateCoverState(player);

            if (Game.IsControlPressed(GTA.Control.Aim))
            {
                ApplyLockOnAssist(player);
            }
        }

        private void TryEnterOrExitCover()
        {
            Ped player = Game.Player.Character;

            if (_inCover)
            {
                // Exit cover: clear tasks and resume free movement.
                player.Task.ClearAll();
                _inCover = false;
                _blindFireEnabled = false;
                return;
            }

            Vector3 coverPos;
            bool found = TryFindNearbyCoverPoint(player.Position, out coverPos);
            if (!found)
                return;

            // Task the ped to move into and use the nearest cover point facing the last
            // known threat direction (or forward if no threat is known).
            Function.Call(Hash.TASK_GO_TO_COORD_ANY_MEANS, player, coverPos.X, coverPos.Y, coverPos.Z, 2.0f, 0, 0, 786603, 0f);
            _inCover = true;
        }

        private bool TryFindNearbyCoverPoint(Vector3 origin, out Vector3 coverPos)
        {
            // Uses the native cover-point search to find a valid nearby cover object.
            OutputArgument coverArg = new OutputArgument();
            bool found = Function.Call<bool>(Hash.GET_SAFE_COORD_FOR_PED, origin.X, origin.Y, origin.Z, true, coverArg, 16);

            if (found)
            {
                coverPos = coverArg.GetResult<Vector3>();
                return coverPos.DistanceTo(origin) <= CoverSearchRadius * 5f;
            }

            coverPos = Vector3.Zero;
            return false;
        }

        private void ToggleBlindFire()
        {
            _blindFireEnabled = !_blindFireEnabled;
            Ped player = Game.Player.Character;

            // Blind fire flag makes the ped fire from cover without exposing/aiming properly.
            Function.Call(Hash.SET_PED_CONFIG_FLAG, player, 184 /* CPED_CONFIG_FLAG_BlindFire */, _blindFireEnabled);
            Notification.PostTicker(_blindFireEnabled ? "Blind fire ON" : "Blind fire OFF", false);
        }

        private void UpdateCoverState(Ped player)
        {
            // If the ped naturally leaves cover (moved away, took damage, etc.) sync our flag.
            bool nativeInCover = Function.Call<bool>(Hash.IS_PED_IN_COVER, player, false);
            if (_inCover && !nativeInCover)
            {
                _inCover = false;
                _blindFireEnabled = false;
            }
        }

        private void ApplyLockOnAssist(Ped player)
        {
            Ped target = FindBestLockOnTarget(player);
            if (target == null)
                return;

            // Soft-assist: nudge task aiming toward the chosen hostile rather than a hard snap,
            // preserving manual aim feel while reducing whiff on fast-moving targets.
            Function.Call(Hash.TASK_TURN_PED_TO_FACE_ENTITY, player, target, 250);
        }

        private Ped FindBestLockOnTarget(Ped player)
        {
            Ped[] nearby = World.GetNearbyPeds(player, LockOnAssistRadius);
            Vector3 camDir = GameplayCamera.Direction;
            Ped best = null;
            float bestAngle = LockOnConeDegrees;

            foreach (Ped candidate in nearby)
            {
                if (candidate == null || !candidate.Exists() || candidate.IsDead || candidate == player)
                    continue;

                if (!Function.Call<bool>(Hash.IS_PED_A_MISSION_ENTITY, candidate) && candidate.RelationshipGroup == player.RelationshipGroup)
                    continue;

                Vector3 toTarget = (candidate.Position - player.Position);
                float dist = toTarget.Length();
                if (dist <= 0.01f)
                    continue;

                toTarget.Normalize();
                float dot = Vector3.Dot(camDir, toTarget);
                float angle = (float)(Math.Acos(Math.Max(-1f, Math.Min(1f, dot))) * (180.0 / Math.PI));

                bool hasLos = Function.Call<bool>(Hash.HAS_ENTITY_CLEAR_LOS_TO_ENTITY, player, candidate, 17);
                if (hasLos && angle < bestAngle)
                {
                    bestAngle = angle;
                    best = candidate;
                }
            }

            return best;
        }
    }
}
