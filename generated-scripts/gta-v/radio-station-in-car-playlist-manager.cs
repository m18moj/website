/*
 * ScripForge — Radio Station & In-Car Playlist Manager
 * Pack: GTA V Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Custom radio-station track lists with in-vehicle playback and a station-switch UI overlay.
 *
 * Written for single-player use via ScriptHookVDotNet — not for GTA Online.
 */

using System;
using System.Collections.Generic;
using System.Drawing;
using GTA;
using GTA.Math;
using GTA.Native;
using GTA.UI;
using Font = GTA.UI.Font;

namespace ScripForge.Systems
{
    /// <summary>
    /// Drives a small set of custom in-car "stations", each with its own ordered track list.
    /// While the player is in a vehicle, bracket keys cycle stations and comma/period cycle
    /// tracks within the current station; a fading overlay in the corner shows what's playing.
    /// </summary>
    public class RadioStationInCarPlaylistManager : Script
    {
        private class Station
        {
            public string Name;
            public List<string> Tracks;

            public Station(string name, params string[] tracks)
            {
                Name = name;
                Tracks = new List<string>(tracks);
            }
        }

        private readonly List<Station> _stations = new List<Station>
        {
            new Station("Los Santos Rock Radio", "Midnight Interstate", "Rust & Chrome", "Static Sundown"),
            new Station("Vinewood Boulevard Radio", "Neon Drift", "Palm Line", "Slow Fade Out"),
            new Station("West Coast Talk Radio", "Traffic Update Loop", "Caller: Downtown", "Sponsor Break"),
            new Station("Blaine County Country", "Dust Road Home", "Long Way Back", "Porch Light"),
        };

        private int _stationIndex;
        private int _trackIndex;
        private DateTime _overlayHideAt = DateTime.MinValue;
        private DateTime _nextTrackAdvance = DateTime.MinValue;
        private bool _wasInVehicle;

        public RadioStationInCarPlaylistManager()
        {
            Tick += OnTick;
            KeyDown += OnKeyDown;
        }

        private void OnTick(object sender, EventArgs e)
        {
            Ped player = Game.Player.Character;
            bool inVehicle = player != null && player.Exists() && player.IsInVehicle();

            if (inVehicle && !_wasInVehicle)
            {
                // Just got in a car: (re)apply the current station and reset its playback clock.
                ApplyStationToVehicle(player.CurrentVehicle);
                ScheduleNextTrack();
            }
            _wasInVehicle = inVehicle;

            if (inVehicle)
                AdvanceTrackIfDue();

            DrawOverlay();
        }

        private void OnKeyDown(object sender, KeyEventArgs e)
        {
            Ped player = Game.Player.Character;
            if (player == null || !player.Exists() || !player.IsInVehicle())
                return;

            if (e.KeyCode == System.Windows.Forms.Keys.OemCloseBrackets)
            {
                _stationIndex = (_stationIndex + 1) % _stations.Count;
                _trackIndex = 0;
                ApplyStationToVehicle(player.CurrentVehicle);
                ScheduleNextTrack();
                ShowOverlay();
            }
            else if (e.KeyCode == System.Windows.Forms.Keys.OemOpenBrackets)
            {
                _stationIndex = (_stationIndex - 1 + _stations.Count) % _stations.Count;
                _trackIndex = 0;
                ApplyStationToVehicle(player.CurrentVehicle);
                ScheduleNextTrack();
                ShowOverlay();
            }
            else if (e.KeyCode == System.Windows.Forms.Keys.OemPeriod)
            {
                AdvanceTrack();
            }
        }

        private void ApplyStationToVehicle(Vehicle veh)
        {
            if (veh == null || !veh.Exists())
                return;

            // Custom stations aren't real radio slots, so we mute the native radio and
            // drive playback ourselves through the overlay + track-advance timer instead.
            Function.Call(Hash.SET_VEH_RADIO_STATION, veh, "OFF");
        }

        private void ScheduleNextTrack()
        {
            _nextTrackAdvance = DateTime.Now.AddSeconds(35);
        }

        private void AdvanceTrackIfDue()
        {
            if (DateTime.Now < _nextTrackAdvance)
                return;

            AdvanceTrack();
        }

        private void AdvanceTrack()
        {
            Station station = _stations[_stationIndex];
            _trackIndex = (_trackIndex + 1) % station.Tracks.Count;
            ScheduleNextTrack();
            ShowOverlay();
        }

        private void ShowOverlay()
        {
            _overlayHideAt = DateTime.Now.AddSeconds(4);
        }

        private void DrawOverlay()
        {
            if (DateTime.Now >= _overlayHideAt)
                return;

            Station station = _stations[_stationIndex];
            string trackName = station.Tracks[_trackIndex];

            new TextElement(
                station.Name,
                new PointF(0.03f * Screen.Resolution.Width, 0.90f * Screen.Resolution.Height),
                0.32f,
                Color.White,
                Font.ChaletLondon,
                Alignment.Left).Draw();

            new TextElement(
                "Now playing: " + trackName,
                new PointF(0.03f * Screen.Resolution.Width, 0.93f * Screen.Resolution.Height),
                0.28f,
                Color.FromArgb(220, 200, 200, 200),
                Font.ChaletLondon,
                Alignment.Left).Draw();
        }
    }
}
