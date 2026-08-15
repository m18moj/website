/*
 * ScripForge — Weather & Time-of-Day Controller
 * Pack: GTA V Pack | Category: World
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Scripted weather transitions blended smoothly alongside an accelerated time-of-day cycle.
 *
 * Written for single-player use via ScriptHookVDotNet — not for GTA Online.
 */

using System;
using System.Collections.Generic;
using GTA;
using GTA.Native;

namespace ScripForge.World
{
    /// <summary>
    /// Drives a custom weather schedule (instead of the game's default random cycling)
    /// and advances in-game time faster than real time, giving level designers and
    /// mission scripts predictable, controllable atmospheric conditions.
    /// </summary>
    public class WeatherTimeOfDayController : Script
    {
        private readonly List<string> _weatherRotation = new List<string>
        {
            "CLEAR", "EXTRASUNNY", "CLOUDS", "OVERCAST", "RAIN", "THUNDER", "CLEARING", "FOGGY"
        };

        private int _rotationIndex;
        private DateTime _lastWeatherChange = DateTime.Now;
        private const double MinutesBetweenWeatherChanges = 8.0;
        private const float TransitionDurationSeconds = 45f;

        // In-game minutes advanced per real-world second. 1.0 = realtime, higher = faster.
        private const float TimeScale = 2.0f;
        private float _accumulatedMinutes;

        private bool _dynamicWeatherEnabled = true;

        public WeatherTimeOfDayController()
        {
            Tick += OnTick;
            Function.Call(Hash.SET_WEATHER_TYPE_NOW_PERSIST, _weatherRotation[_rotationIndex]);
        }

        private void OnTick(object sender, EventArgs e)
        {
            AdvanceClock();

            if (_dynamicWeatherEnabled)
                RotateWeatherIfDue();
        }

        private void AdvanceClock()
        {
            _accumulatedMinutes += Game.LastFrameTime * TimeScale;

            if (_accumulatedMinutes >= 1f)
            {
                int wholeMinutes = (int)_accumulatedMinutes;
                _accumulatedMinutes -= wholeMinutes;

                int totalMinutes = World.CurrentDayTime.Hours * 60 + World.CurrentDayTime.Minutes + wholeMinutes;
                int hour = (totalMinutes / 60) % 24;
                int minute = totalMinutes % 60;
                int second = World.CurrentDayTime.Seconds;

                World.CurrentDayTime = new TimeSpan(hour, minute, second);
            }
        }

        private void RotateWeatherIfDue()
        {
            if ((DateTime.Now - _lastWeatherChange).TotalMinutes < MinutesBetweenWeatherChanges)
                return;

            _lastWeatherChange = DateTime.Now;
            _rotationIndex = (_rotationIndex + 1) % _weatherRotation.Count;

            string nextWeather = _weatherRotation[_rotationIndex];
            Function.Call(Hash.SET_WEATHER_TYPE_OVER_TIME, nextWeather, TransitionDurationSeconds);

            GTA.UI.Notification.PostTicker($"Weather shifting to {nextWeather}.", false);
        }

        /// <summary>Forces an immediate weather change, e.g. for a scripted mission beat.</summary>
        public void ForceWeather(string weatherName, bool instant)
        {
            if (instant)
                Function.Call(Hash.SET_WEATHER_TYPE_NOW_PERSIST, weatherName);
            else
                Function.Call(Hash.SET_WEATHER_TYPE_OVER_TIME, weatherName, TransitionDurationSeconds);

            _lastWeatherChange = DateTime.Now;
        }

        /// <summary>Pauses/resumes the automatic weather rotation, e.g. during scripted cutscenes.</summary>
        public void SetDynamicWeatherEnabled(bool enabled)
        {
            _dynamicWeatherEnabled = enabled;
        }
    }
}
