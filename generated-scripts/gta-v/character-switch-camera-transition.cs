/*
 * ScriptForge — Character Switch & Camera Transition
 * Pack: GTA V Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Custom swooping satellite camera transition played whenever the player switches characters.
 *
 * Written for single-player use via ScriptHookVDotNet — not for GTA Online.
 */

using System;
using System.Windows.Forms;
using GTA;
using GTA.Math;
using GTA.Native;

namespace ScriptForge.Systems
{
    /// <summary>
    /// Hooks a hotkey-driven character roster (Michael/Franklin/Trevor by default) and,
    /// on switch, plays a scripted swoop-up-and-down camera move instead of the vanilla
    /// instant cut, giving a cinematic "satellite view" transition between switches.
    /// </summary>
    public class CharacterSwitchCameraTransition : Script
    {
        private enum SwitchState { Idle, SwoopUp, HoldAerial, SwoopDown }

        private readonly string[] _rosterModels = { "player_zero", "player_one", "player_two" }; // Michael, Franklin, Trevor
        private int _currentIndex;

        private SwitchState _state = SwitchState.Idle;
        private Camera _transitionCam;
        private float _stateTimer;

        private const float SwoopUpDuration = 1.0f;
        private const float AerialHoldDuration = 0.6f;
        private const float SwoopDownDuration = 1.0f;
        private const float AerialHeight = 400f;

        private Ped _pendingPed;

        public CharacterSwitchCameraTransition()
        {
            Tick += OnTick;
            KeyDown += OnKeyDown;
        }

        private void OnKeyDown(object sender, KeyEventArgs e)
        {
            if (_state != SwitchState.Idle)
                return;

            if (e.KeyCode == Keys.NumPad1) BeginSwitch(0);
            else if (e.KeyCode == Keys.NumPad2) BeginSwitch(1);
            else if (e.KeyCode == Keys.NumPad3) BeginSwitch(2);
        }

        private void BeginSwitch(int rosterIndex)
        {
            if (rosterIndex == _currentIndex)
                return;

            _currentIndex = rosterIndex;
            _state = SwitchState.SwoopUp;
            _stateTimer = 0f;

            _transitionCam = World.CreateCamera(Game.Player.Character.Position, Vector3.Zero, GameplayCamera.FieldOfView);
            _transitionCam.PointAt(Game.Player.Character);
            World.RenderingCamera = _transitionCam;

            Game.Player.Character.CanBeKnockedOffBike = false;
        }

        private void OnTick(object sender, EventArgs e)
        {
            if (_state == SwitchState.Idle)
                return;

            _stateTimer += Game.LastFrameTime;
            Vector3 groundPos = Game.Player.Character.Position;

            switch (_state)
            {
                case SwitchState.SwoopUp:
                    UpdateSwoop(groundPos, 0f, AerialHeight, SwoopUpDuration);
                    if (_stateTimer >= SwoopUpDuration)
                    {
                        _stateTimer = 0f;
                        _state = SwitchState.HoldAerial;
                        SwapToRosterPed();
                    }
                    break;

                case SwitchState.HoldAerial:
                    if (_stateTimer >= AerialHoldDuration)
                    {
                        _stateTimer = 0f;
                        _state = SwitchState.SwoopDown;
                    }
                    break;

                case SwitchState.SwoopDown:
                    UpdateSwoop(groundPos, AerialHeight, 0f, SwoopDownDuration);
                    if (_stateTimer >= SwoopDownDuration)
                    {
                        FinishSwitch();
                    }
                    break;
            }
        }

        private void UpdateSwoop(Vector3 groundPos, float fromHeight, float toHeight, float duration)
        {
            float t = Math.Min(1f, _stateTimer / duration);
            float eased = t * t * (3f - 2f * t); // smoothstep
            float height = fromHeight + (toHeight - fromHeight) * eased;

            Vector3 camPos = groundPos + new Vector3(40f, 40f, height);
            _transitionCam.Position = camPos;
            _transitionCam.PointAt(groundPos);
        }

        private void SwapToRosterPed()
        {
            // In a full implementation this would call SWITCH_MENU / SET_PLAYER_MODEL against
            // the roster's saved ped state. Here we demonstrate the native call pattern.
            Model model = new Model(_rosterModels[_currentIndex]);
            model.Request(1000);

            if (model.IsInCdImage && model.IsValid)
            {
                float preservedHeading = Game.Player.Character.Heading;
                Function.Call(Hash.SET_PLAYER_MODEL, Game.Player, model.Hash);
                Game.Player.Character.Heading = preservedHeading; // keep facing consistent across the swap
            }
            model.MarkAsNoLongerNeeded();
        }

        private void FinishSwitch()
        {
            World.RenderingCamera = null;
            _transitionCam.Delete();
            _transitionCam = null;
            Game.Player.Character.CanBeKnockedOffBike = true;
            _state = SwitchState.Idle;
        }
    }
}
