/*
 * ScripForge — Vehicle Mod Shop Customization
 * Pack: GTA V Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Performance and cosmetic upgrade slots (engine, armor, livery) purchasable at a mod shop menu.
 *
 * Written for single-player use via ScriptHookVDotNet — not for GTA Online.
 */

using System;
using System.Collections.Generic;
using GTA;
using GTA.Math;
using GTA.Native;
using GTA.UI;

namespace ScripForge.Systems
{
    internal class ModUpgrade
    {
        public string Label;
        public int ModType;      // native vehicle mod type index
        public int TargetLevel;  // mod level to install when purchased
        public int Price;

        public ModUpgrade(string label, int modType, int targetLevel, int price)
        {
            Label = label;
            ModType = modType;
            TargetLevel = targetLevel;
            Price = price;
        }
    }

    /// <summary>
    /// A simple mod shop menu triggered near garage zones. Cycles through a fixed catalog of
    /// engine, armor, and livery upgrades with F8/F9 to navigate and F10 to purchase and apply
    /// the highlighted upgrade to the vehicle the player is currently in.
    /// </summary>
    public class VehicleModShopCustomization : Script
    {
        private readonly Vector3 _shopLocation = new Vector3(-347.0f, -133.0f, 39.0f);
        private readonly List<ModUpgrade> _catalog = new List<ModUpgrade>
        {
            new ModUpgrade("Engine Upgrade — Stage 1", 11, 1, 800),
            new ModUpgrade("Engine Upgrade — Stage 2", 11, 2, 1500),
            new ModUpgrade("Engine Upgrade — Stage 3", 11, 3, 2600),
            new ModUpgrade("Brakes — Street", 12, 1, 400),
            new ModUpgrade("Brakes — Race", 12, 2, 900),
            new ModUpgrade("Armor Plating — Level 1", 16, 1, 1200),
            new ModUpgrade("Armor Plating — Level 5 (max)", 16, 4, 4000),
            new ModUpgrade("Livery — Racing Stripes", 48, 1, 350),
            new ModUpgrade("Livery — Matte Wrap", 48, 2, 500),
        };

        private const float InteractionRadius = 5.0f;

        private int _selectedIndex;
        private bool _menuOpen;
        private Blip _shopBlip;

        public VehicleModShopCustomization()
        {
            Tick += OnTick;
            KeyDown += OnKeyDown;

            _shopBlip = World.CreateBlip(_shopLocation);
            _shopBlip.Sprite = BlipSprite.CarModShop;
            _shopBlip.Color = BlipColor.Blue;
            _shopBlip.Name = "Mod Shop";
        }

        private void OnTick(object sender, EventArgs e)
        {
            if (!_menuOpen)
                return;

            DrawMenu();
        }

        private void OnKeyDown(object sender, KeyEventArgs e)
        {
            if (!_menuOpen)
            {
                if (e.KeyCode == System.Windows.Forms.Keys.F8)
                    TryOpenMenu();
                return;
            }

            switch (e.KeyCode)
            {
                case System.Windows.Forms.Keys.Up:
                    _selectedIndex = (_selectedIndex - 1 + _catalog.Count) % _catalog.Count;
                    break;
                case System.Windows.Forms.Keys.Down:
                    _selectedIndex = (_selectedIndex + 1) % _catalog.Count;
                    break;
                case System.Windows.Forms.Keys.Enter:
                    PurchaseSelected();
                    break;
                case System.Windows.Forms.Keys.F8:
                    _menuOpen = false;
                    break;
            }
        }

        private void TryOpenMenu()
        {
            Ped player = Game.Player.Character;

            if (player.Position.DistanceTo(_shopLocation) > InteractionRadius)
            {
                Notification.PostTicker("You need to be at the mod shop to browse upgrades.", false);
                return;
            }

            if (!player.IsInVehicle())
            {
                Notification.PostTicker("Pull a vehicle into the shop first.", false);
                return;
            }

            _menuOpen = true;
            _selectedIndex = 0;
        }

        private void DrawMenu()
        {
            Ped player = Game.Player.Character;
            if (!player.IsInVehicle())
            {
                _menuOpen = false;
                return;
            }

            for (int i = 0; i < _catalog.Count; i++)
            {
                ModUpgrade item = _catalog[i];
                string prefix = i == _selectedIndex ? "~b~> " : "~w~  ";
                string line = string.Format("{0}{1} — ${2}", prefix, item.Label, item.Price);

                new TextElement(line, new PointF(0.05f, 0.30f + i * 0.03f), 0.35f).Draw();
            }
        }

        private void PurchaseSelected()
        {
            Ped player = Game.Player.Character;
            if (!player.IsInVehicle())
                return;

            Vehicle veh = player.CurrentVehicle;
            ModUpgrade item = _catalog[_selectedIndex];

            if (Game.Player.Money < item.Price)
            {
                Notification.PostTicker("~r~Not enough cash for that upgrade.", false);
                return;
            }

            Function.Call(Hash.SET_VEHICLE_MOD_KIT, veh, 0);
            Function.Call(Hash.SET_VEHICLE_MOD, veh, item.ModType, item.TargetLevel, false);

            if (item.ModType == 48)
            {
                // Livery mods use a dedicated native rather than the generic mod slot.
                Function.Call(Hash.SET_VEHICLE_LIVERY, veh, item.TargetLevel);
            }

            Game.Player.Money -= item.Price;
            Notification.PostTicker(string.Format("~g~Installed: {0}", item.Label), false);
        }
    }
}
