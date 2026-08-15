/*
 * ScripForge — Arms Dealer Black Market Trade
 * Pack: GTA V Pack | Category: Economy
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Illicit weapon/vehicle trade offers with heat-based price fluctuation and delivery risk.
 *
 * Written for single-player use via ScriptHookVDotNet — not for GTA Online.
 */

using System;
using System.Collections.Generic;
using GTA;
using GTA.Math;
using GTA.Native;
using GTA.UI;

namespace ScripForge.Economy
{
    internal enum TradeGoodType
    {
        Weapon,
        Vehicle,
    }

    internal class TradeOffer
    {
        public string Name;
        public TradeGoodType GoodType;
        public WeaponHash Weapon;
        public VehicleHash VehicleModel;
        public int BasePrice;

        public TradeOffer(string name, WeaponHash weapon, int basePrice)
        {
            Name = name;
            GoodType = TradeGoodType.Weapon;
            Weapon = weapon;
            BasePrice = basePrice;
        }

        public TradeOffer(string name, VehicleHash vehicleModel, int basePrice)
        {
            Name = name;
            GoodType = TradeGoodType.Vehicle;
            VehicleModel = vehicleModel;
            BasePrice = basePrice;
        }
    }

    /// <summary>
    /// A meet-up point where the player can buy illicit weapons or vehicles off the books.
    /// Prices climb with the player's current wanted level (heat), and every purchase risks a
    /// chance the deal gets "burned" — a wanted-level spike as cops close in on the meet.
    /// </summary>
    public class ArmsDealerBlackMarketTrade : Script
    {
        private readonly Vector3 _meetPoint = new Vector3(2432.0f, 3115.0f, 48.0f);
        private readonly List<TradeOffer> _offers = new List<TradeOffer>
        {
            new TradeOffer("Compact Pistol", WeaponHash.CombatPistol, 900),
            new TradeOffer("Chopped SMG", WeaponHash.MicroSMG, 2200),
            new TradeOffer("Combat Shotgun", WeaponHash.PumpShotgun, 1800),
            new TradeOffer("Stolen Sports Car", VehicleHash.Comet2, 15000),
            new TradeOffer("Armored SUV", VehicleHash.Baller, 22000),
        };

        private const float InteractionRadius = 4.5f;

        private int _selectedIndex;
        private bool _menuOpen;
        private Blip _meetBlip;
        private readonly Random _rng = new Random();

        public ArmsDealerBlackMarketTrade()
        {
            Tick += OnTick;
            KeyDown += OnKeyDown;

            _meetBlip = World.CreateBlip(_meetPoint);
            _meetBlip.Sprite = BlipSprite.ArmoryWeapon;
            _meetBlip.Color = BlipColor.Orange;
            _meetBlip.Name = "??? Contact";
        }

        private void OnTick(object sender, EventArgs e)
        {
            if (_menuOpen)
                DrawMenu();
        }

        private void OnKeyDown(object sender, KeyEventArgs e)
        {
            if (!_menuOpen)
            {
                if (e.KeyCode == System.Windows.Forms.Keys.F9)
                    TryOpenMenu();
                return;
            }

            switch (e.KeyCode)
            {
                case System.Windows.Forms.Keys.Up:
                    _selectedIndex = (_selectedIndex - 1 + _offers.Count) % _offers.Count;
                    break;
                case System.Windows.Forms.Keys.Down:
                    _selectedIndex = (_selectedIndex + 1) % _offers.Count;
                    break;
                case System.Windows.Forms.Keys.Enter:
                    PurchaseSelected();
                    break;
                case System.Windows.Forms.Keys.F9:
                    _menuOpen = false;
                    break;
            }
        }

        private void TryOpenMenu()
        {
            if (Game.Player.Character.Position.DistanceTo(_meetPoint) > InteractionRadius)
            {
                Notification.PostTicker("No contact here. Find the meet point.", false);
                return;
            }

            _menuOpen = true;
            _selectedIndex = 0;
        }

        private float CurrentHeatMultiplier()
        {
            // Each wanted star bumps price roughly 15% — dealer charges a risk premium.
            int wanted = Game.Player.WantedLevel;
            return 1.0f + wanted * 0.15f;
        }

        private void DrawMenu()
        {
            float multiplier = CurrentHeatMultiplier();

            string header = string.Format("~o~Black Market Contact (heat x{0:0.00})", multiplier);
            new TextElement(header, new PointF(0.05f, 0.25f), 0.4f).Draw();

            for (int i = 0; i < _offers.Count; i++)
            {
                TradeOffer offer = _offers[i];
                int price = (int)(offer.BasePrice * multiplier);
                string prefix = i == _selectedIndex ? "~b~> " : "~w~  ";
                string line = string.Format("{0}{1} — ${2}", prefix, offer.Name, price);
                new TextElement(line, new PointF(0.05f, 0.29f + i * 0.03f), 0.35f).Draw();
            }
        }

        private void PurchaseSelected()
        {
            TradeOffer offer = _offers[_selectedIndex];
            float multiplier = CurrentHeatMultiplier();
            int price = (int)(offer.BasePrice * multiplier);

            if (Game.Player.Money < price)
            {
                Notification.PostTicker("~r~You can't cover that price.", false);
                return;
            }

            Game.Player.Money -= price;

            if (offer.GoodType == TradeGoodType.Weapon)
            {
                Game.Player.Character.Weapons.Give(offer.Weapon, 250, true, true);
                Notification.PostTicker(string.Format("~g~Acquired {0} for ${1}", offer.Name, price), false);
            }
            else
            {
                DeliverVehicle(offer.VehicleModel, offer.Name, price);
            }

            RollDeliveryRisk();
        }

        private void DeliverVehicle(VehicleHash vehicleModel, string name, int price)
        {
            Model model = new Model(vehicleModel);
            model.Request(1000);
            if (!model.IsLoaded)
            {
                Notification.PostTicker("~r~Delivery vehicle failed to load — refunding.", false);
                Game.Player.Money += price;
                return;
            }

            Vector3 spawnPos = _meetPoint + new Vector3(6.0f, 0f, 0f);
            Vehicle veh = World.CreateVehicle(model, spawnPos);
            if (veh != null && veh.Exists())
            {
                veh.IsPersistent = true;
                Function.Call(Hash.SET_VEHICLE_NUMBER_PLATE_TEXT, veh, "UNMRKD");
                Notification.PostTicker(string.Format("~g~{0} delivered for ${1}", name, price), false);
            }

            model.MarkAsNoLongerNeeded();
        }

        private void RollDeliveryRisk()
        {
            // ~15% base chance the deal gets burned, escalating wanted level regardless of good type.
            if (_rng.NextDouble() < 0.15)
            {
                Notification.PostTicker("~r~It's a setup! Cops are closing in!", false);
                int current = Game.Player.WantedLevel;
                Function.Call(Hash.SET_PLAYER_WANTED_LEVEL, Game.Player, Math.Min(5, current + 2), false);
                Function.Call(Hash.SET_PLAYER_WANTED_LEVEL_NOW, Game.Player, false);
            }
        }
    }
}
