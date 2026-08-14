/*
 * ScriptForge — ForgeClient (GTA V)
 * Component: Main Feature Menu
 * Version: 1.0.0
 *
 * In-game settings menu that lists every script in the ScriptForge GTA V pack and lets the
 * player toggle each feature (and a few sub-settings) live, without editing any files.
 *
 * Written for single-player use via Script Hook V .NET — not for GTA Online.
 */

// UI APPROACH: this menu is hand-rolled on top of GTA.UI (TextElement/Screen), the same
// drawing API the rest of this pack already uses (see InGamePhoneContactMenu.cs and
// ClothingCharacterCustomizationMenu.cs). NativeUI-style checkbox/list-menu conventions
// (title bar, highlighted row, [ON]/[OFF] tags, ">" for submenus) are reproduced by hand
// instead of taking a hard dependency on the third-party NativeUI.dll, so this file compiles
// and runs with nothing more than the standard Script Hook V .NET references the rest of the
// pack already requires. Swap the Draw* methods for real GTA.UI.Menu/NativeUI.UIMenu calls
// if you prefer that library — the toggle logic below (reading/writing ForgeClientConfig and
// the other pack classes) is identical either way.

using System;
using System.Collections.Generic;
using System.Drawing;
using System.Windows.Forms;
using GTA;
using GTA.UI;

namespace ScriptForge.Client
{
    /// <summary>
    /// Master settings menu for the ScriptForge GTA V pack. Press F9 (configurable via
    /// <see cref="ForgeClientConfig.MenuToggleKey"/>) to open/close. Arrow keys navigate,
    /// Enter drills into a submenu or fires a toggle, Backspace/Escape backs out.
    /// </summary>
    public class ForgeClientMenu : Script
    {
        private enum Screen_ { Main, Weather, Parachute, WantedLevel }

        /// <summary>One row in whichever menu screen is currently active.</summary>
        private class MenuEntry
        {
            public string Label;
            public Func<string> Status;     // right-aligned value text, e.g. "ON" / "CLEAR"
            public Action Activate;         // Enter: open submenu or fire a one-shot toggle
            public Action<int> Adjust;      // Left(-1)/Right(+1): cycle a value in place
        }

        private bool _menuOpen;
        private Screen_ _screen = Screen_.Main;
        private int _selected;
        private DateTime _lastInput = DateTime.MinValue;
        private const double InputCooldownSeconds = 0.16;

        private List<MenuEntry> _mainEntries;
        private List<MenuEntry> _weatherEntries;
        private List<MenuEntry> _parachuteEntries;
        private List<MenuEntry> _wantedEntries;

        public ForgeClientMenu()
        {
            BuildMenus();
            Tick += OnTick;
            KeyDown += OnKeyDown;
            Aborted += OnAborted;
        }

        // --------------------------------------------------------------
        // Menu construction — each row maps straight onto a real pack
        // script/config flag, referenced by its actual class name.
        // --------------------------------------------------------------
        private void BuildMenus()
        {
            _mainEntries = new List<MenuEntry>
            {
                Toggle("Garage & Vehicle Storage", () => ForgeClientConfig.GarageEnabled, v => ForgeClientConfig.GarageEnabled = v),
                Submenu("Weather Control", () => Screen_.Weather, () => ForgeClientConfig.WeatherControlEnabled),
                Submenu("Parachute Assist", () => Screen_.Parachute, () => ForgeClientConfig.ParachuteAssistEnabled),
                Toggle("Gang Territory Control", () => ForgeClientConfig.GangTerritoryEnabled, v => ForgeClientConfig.GangTerritoryEnabled = v),
                Submenu("Wanted Level Manager", () => Screen_.WantedLevel, () => ForgeClientConfig.WantedLevelManagerEnabled),
                Toggle("Police Chase Tweaks", () => ForgeClientConfig.PoliceChaseTweaksEnabled, v => ForgeClientConfig.PoliceChaseTweaksEnabled = v),
                Toggle("Stock Market & Investments", () => ForgeClientConfig.StockMarketEnabled, v => ForgeClientConfig.StockMarketEnabled = v),
                Toggle("Wardrobe & Customization", () => ForgeClientConfig.CharacterCustomizationEnabled, v => ForgeClientConfig.CharacterCustomizationEnabled = v),
                Toggle("NPC Traffic AI", () => ForgeClientConfig.NpcTrafficAiEnabled, v => ForgeClientConfig.NpcTrafficAiEnabled = v),
                Toggle("Stunt Jump Score Tracker", () => ForgeClientConfig.StuntScoreTrackerEnabled, v => ForgeClientConfig.StuntScoreTrackerEnabled = v),
                Toggle("Economy & Property System", () => ForgeClientConfig.EconomyPropertyEnabled, v => ForgeClientConfig.EconomyPropertyEnabled = v),
                Toggle("Heist Preparation Flow", () => ForgeClientConfig.HeistPrepEnabled, v => ForgeClientConfig.HeistPrepEnabled = v),
            };

            _weatherEntries = new List<MenuEntry>
            {
                Toggle("Dynamic Weather (WeatherTimeOfDayController)", () => ForgeClientConfig.WeatherControlEnabled, v => ForgeClientConfig.WeatherControlEnabled = v),
                Toggle("Lock Weather", () => ForgeClientConfig.LockWeather, v => ForgeClientConfig.LockWeather = v),
                new MenuEntry
                {
                    Label = "Locked Weather Type",
                    Status = () => ForgeClientConfig.WeatherTypes[ForgeClientConfig.SelectedWeatherIndex],
                    Adjust = dir => ForgeClientConfig.SelectedWeatherIndex = Wrap(
                        ForgeClientConfig.SelectedWeatherIndex + dir, ForgeClientConfig.WeatherTypes.Length),
                },
                Back(() => _screen = Screen_.Main),
            };

            _parachuteEntries = new List<MenuEntry>
            {
                Toggle("Parachute Assist (ParachuteSkydivingController)", () => ForgeClientConfig.ParachuteAssistEnabled, v => ForgeClientConfig.ParachuteAssistEnabled = v),
                Toggle("Unlimited Parachutes", () => ForgeClientConfig.UnlimitedParachutes, v => ForgeClientConfig.UnlimitedParachutes = v),
                Back(() => _screen = Screen_.Main),
            };

            _wantedEntries = new List<MenuEntry>
            {
                Toggle("Wanted Level Manager", () => ForgeClientConfig.WantedLevelManagerEnabled, v => ForgeClientConfig.WantedLevelManagerEnabled = v),
                Toggle("Never Wanted", () => ForgeClientConfig.NeverWanted, v => ForgeClientConfig.NeverWanted = v),
                new MenuEntry
                {
                    Label = "Max Wanted Stars",
                    Status = () => ForgeClientConfig.MaxWantedStars.ToString(),
                    Adjust = dir => ForgeClientConfig.MaxWantedStars = Math.Max(1, Math.Min(5, ForgeClientConfig.MaxWantedStars + dir)),
                },
                Back(() => _screen = Screen_.Main),
            };
        }

        // Small factory helpers keep BuildMenus readable.
        private static MenuEntry Toggle(string label, Func<bool> get, Action<bool> set) => new MenuEntry
        {
            Label = label,
            Status = () => get() ? "~g~ON~w~" : "~r~OFF~w~",
            Activate = () => set(!get()),
            Adjust = _ => set(!get()),
        };

        private MenuEntry Submenu(string label, Func<Screen_> target, Func<bool> enabledFlag) => new MenuEntry
        {
            Label = label,
            Status = () => (enabledFlag() ? "~g~ON~w~ " : "~r~OFF~w~ ") + ">",
            Activate = () => { _screen = target(); _selected = 0; },
        };

        private MenuEntry Back(Action go) => new MenuEntry
        {
            Label = "< Back",
            Status = () => "",
            Activate = () => { go(); _selected = 0; },
        };

        private static int Wrap(int value, int count) => ((value % count) + count) % count;

        // --------------------------------------------------------------
        // Input / lifecycle
        // --------------------------------------------------------------
        private void OnKeyDown(object sender, KeyEventArgs e)
        {
            if (e.KeyCode == ForgeClientConfig.MenuToggleKey)
            {
                _menuOpen = !_menuOpen;
                _screen = Screen_.Main;
                _selected = 0;
                if (_menuOpen)
                    Screen.ShowSubtitle("~b~ForgeClient~w~ menu opened. Arrows to navigate, Enter to select, Esc to close.", 2000);
                return;
            }

            if (!_menuOpen)
                return;

            if ((DateTime.Now - _lastInput).TotalSeconds < InputCooldownSeconds)
                return;

            List<MenuEntry> active = CurrentList();

            switch (e.KeyCode)
            {
                case Keys.Up:
                    _selected = Wrap(_selected - 1, active.Count);
                    break;
                case Keys.Down:
                    _selected = Wrap(_selected + 1, active.Count);
                    break;
                case Keys.Left:
                    active[_selected].Adjust?.Invoke(-1);
                    break;
                case Keys.Right:
                    active[_selected].Adjust?.Invoke(1);
                    break;
                case Keys.Enter:
                    active[_selected].Activate?.Invoke();
                    _selected = Math.Min(_selected, CurrentList().Count - 1);
                    break;
                case Keys.Back:
                case Keys.Escape:
                    if (_screen == Screen_.Main)
                        _menuOpen = false;
                    else
                        _screen = Screen_.Main;
                    _selected = 0;
                    break;
            }

            _lastInput = DateTime.Now;
        }

        private void OnTick(object sender, EventArgs e)
        {
            if (_menuOpen)
                DrawMenu();
        }

        private List<MenuEntry> CurrentList()
        {
            switch (_screen)
            {
                case Screen_.Weather: return _weatherEntries;
                case Screen_.Parachute: return _parachuteEntries;
                case Screen_.WantedLevel: return _wantedEntries;
                default: return _mainEntries;
            }
        }

        private string TitleFor(Screen_ s)
        {
            switch (s)
            {
                case Screen_.Weather: return "ForgeClient — Weather Control";
                case Screen_.Parachute: return "ForgeClient — Parachute Assist";
                case Screen_.WantedLevel: return "ForgeClient — Wanted Level Manager";
                default: return "ForgeClient — ScriptForge GTA V Pack";
            }
        }

        // --------------------------------------------------------------
        // Rendering
        // --------------------------------------------------------------
        private void DrawMenu()
        {
            const float baseX = 0.03f;
            const float baseY = 0.28f;
            const float lineHeight = 0.032f;

            List<MenuEntry> active = CurrentList();

            new TextElement(TitleFor(_screen), new PointF(baseX * Screen.Width, (baseY - lineHeight * 1.4f) * Screen.Height), 0.42f).Draw();

            for (int i = 0; i < active.Count; i++)
            {
                bool isSelected = i == _selected;
                string prefix = isSelected ? "~b~▶ " : "~w~   ";
                string status = active[i].Status?.Invoke() ?? "";
                string line = $"{prefix}{active[i].Label,-38}{status}";

                var pos = new PointF(baseX * Screen.Width, (baseY + i * lineHeight) * Screen.Height);
                new TextElement(line, pos, 0.35f).Draw();
            }
        }

        // --------------------------------------------------------------
        // Cleanup — required so the script doesn't leave input handlers
        // registered or the overlay mid-draw if SHVDN unloads/reloads it.
        // --------------------------------------------------------------
        private void OnAborted(object sender, EventArgs e)
        {
            _menuOpen = false;
            Tick -= OnTick;
            KeyDown -= OnKeyDown;
            Aborted -= OnAborted;
        }
    }
}
