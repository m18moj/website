/*
 * ScriptForge — ForgeClient (GTA V)
 * Component: Shared Client Config
 * Version: 1.0.0
 *
 * Static, process-wide toggle/setting store that ForgeClientMenu writes to and that the
 * individual ScriptForge GTA V pack scripts are meant to read from.
 *
 * Written for single-player use via Script Hook V .NET — not for GTA Online.
 */

namespace ScriptForge.Client
{
    /// <summary>
    /// Central settings bag for the ForgeClient menu.
    ///
    /// HOW AN EXISTING PACK SCRIPT OPTS IN
    /// ------------------------------------
    /// Each of the 20 ScriptForge GTA V scripts currently runs unconditionally once loaded
    /// by Script Hook V .NET. To make a script controllable from the ForgeClientMenu, add a
    /// one-line guard at the top of its Tick handler (and, optionally, its KeyDown handler)
    /// that checks the matching flag below, e.g. inside GarageVehicleStorageManager.OnTick:
    ///
    ///     private void OnTick(object sender, EventArgs e)
    ///     {
    ///         if (!ScriptForge.Client.ForgeClientConfig.GarageEnabled)
    ///             return;
    ///         ...
    ///     }
    ///
    /// No constructor changes, no new references, and no dependency on this DLL beyond the
    /// single "ScriptForge.Client" using/qualified reference — the flags are plain static
    /// fields so any script in the Scripts folder can read them for free. Nothing needs to
    /// write back to this class except ForgeClientMenu.
    /// </summary>
    public static class ForgeClientConfig
    {
        // ------------------------------------------------------------------
        // Menu behavior
        // ------------------------------------------------------------------

        /// <summary>Hotkey that opens/closes the ForgeClient menu. Change here to remap.</summary>
        public static System.Windows.Forms.Keys MenuToggleKey = System.Windows.Forms.Keys.F9;

        // ------------------------------------------------------------------
        // Feature master switches — one per pack script, all default ON so the
        // pack behaves exactly as before until the player opens the menu.
        // ------------------------------------------------------------------

        /// <summary>Gates GarageVehicleStorageManager (ScriptForge.Systems).</summary>
        public static bool GarageEnabled = true;

        /// <summary>Gates WeatherTimeOfDayController (ScriptForge.World).</summary>
        public static bool WeatherControlEnabled = true;

        /// <summary>Gates ParachuteSkydivingController (ScriptForge.Movement).</summary>
        public static bool ParachuteAssistEnabled = true;

        /// <summary>Gates GangTerritoryTurfControl (ScriptForge.World).</summary>
        public static bool GangTerritoryEnabled = true;

        /// <summary>Gates WantedLevelManager (ScriptForge.Systems).</summary>
        public static bool WantedLevelManagerEnabled = true;

        /// <summary>Gates PoliceChaseSystem (ScriptForge.AI).</summary>
        public static bool PoliceChaseTweaksEnabled = true;

        /// <summary>Gates StockMarketInvestmentSystem (ScriptForge.Economy).</summary>
        public static bool StockMarketEnabled = true;

        /// <summary>Gates ClothingCharacterCustomizationMenu (ScriptForge.Systems).</summary>
        public static bool CharacterCustomizationEnabled = true;

        /// <summary>Gates NpcTrafficAi (ScriptForge.AI).</summary>
        public static bool NpcTrafficAiEnabled = true;

        /// <summary>Gates StuntJumpTrickScoreTracker (ScriptForge.Systems).</summary>
        public static bool StuntScoreTrackerEnabled = true;

        /// <summary>Gates EconomyPropertySystem (ScriptForge.Economy).</summary>
        public static bool EconomyPropertyEnabled = true;

        /// <summary>Gates HeistPreparationFlow (ScriptForge.Missions).</summary>
        public static bool HeistPrepEnabled = true;

        // ------------------------------------------------------------------
        // Weather sub-settings (read by WeatherTimeOfDayController when it
        // opts in via WeatherControlEnabled above)
        // ------------------------------------------------------------------

        /// <summary>When true, the weather rotation is frozen on <see cref="WeatherTypes"/>[<see cref="SelectedWeatherIndex"/>].</summary>
        public static bool LockWeather = false;

        /// <summary>Index into <see cref="WeatherTypes"/> selecting the locked weather type.</summary>
        public static int SelectedWeatherIndex = 0;

        /// <summary>Native SET_WEATHER_TYPE_* names, matching WeatherTimeOfDayController's rotation.</summary>
        public static readonly string[] WeatherTypes =
        {
            "CLEAR", "EXTRASUNNY", "CLOUDS", "OVERCAST", "RAIN", "THUNDER", "CLEARING", "FOGGY"
        };

        // ------------------------------------------------------------------
        // Parachute sub-settings (read by ParachuteSkydivingController)
        // ------------------------------------------------------------------

        /// <summary>When true, chute deploys always succeed with no reserve-count depletion.</summary>
        public static bool UnlimitedParachutes = false;

        // ------------------------------------------------------------------
        // Wanted level sub-settings (read by WantedLevelManager)
        // ------------------------------------------------------------------

        /// <summary>When true, the player's wanted level is force-cleared every tick.</summary>
        public static bool NeverWanted = false;

        /// <summary>Hard cap (1-5 stars) applied by WantedLevelManager when NeverWanted is false.</summary>
        public static int MaxWantedStars = 5;
    }
}
